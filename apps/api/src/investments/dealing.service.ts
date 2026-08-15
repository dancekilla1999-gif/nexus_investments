import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditActorType,
  LedgerAccountType,
  LedgerTransactionType,
  NotificationType,
  Prisma,
  RedemptionRequestStatus,
  SubscriptionRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { exactDiff, exactNeg, exactSum, formatAmount, quantize } from '../ledger/amount.util';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { NavService } from '../nav/nav.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeesService } from './fees.service';
import { adjustTotalUnits } from './units.util';

export interface DealingPointResult {
  snapshotId: string;
  navPerUnit: string;
  poolNav: string;
  totalUnits: string;
  subscriptionsSettled: number;
  redemptionsSettled: number;
  redemptionsQueued: number;
}

/**
 * Dealing points: where NAV is struck and units actually change hands (docs/12 §2.2, docs/14
 * steps 3 and 8).
 *
 * The order of operations inside a dealing point is load-bearing:
 *
 *   1. Value the pool **before** anything settles. This is the price everyone deals at, and it
 *      must not be influenced by the flows about to be processed.
 *   2. Settle subscriptions at that price — new money buys in at what the pool was worth a
 *      moment ago, capturing none of the gains that produced it.
 *   3. Settle redemptions at the same price.
 *
 * Striking NAV *after* moving subscription cash into the pool would inflate `poolNav` while
 * `totalUnits` still reflected only existing holders, handing the new investor's own money to
 * everyone else. That is the dilution bug, and it is prevented by the sequence rather than by
 * remembering not to make the mistake.
 */
@Injectable()
export class DealingService {
  private readonly logger = new Logger(DealingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly nav: NavService,
    private readonly fees: FeesService,
  ) {}

  /**
   * Values a strategy's pool. Delegates to the NAV engine — there is exactly one valuation
   * path in the platform, and it is the one that sources prices and records their provenance.
   *
   * Kept as a method here so existing callers and tests have a stable entry point, but it owns
   * no arithmetic of its own: two ways to value a pool is two answers to "what is this worth?".
   */
  async valuePool(strategyId: string): Promise<Prisma.Decimal> {
    return (await this.nav.valuePool(strategyId)).poolNav;
  }

  /**
   * Strikes a dealing point and settles everything waiting on one.
   *
   * `reason` is an operator note for the audit log, not an input to the valuation. Prices come
   * from the NAV engine's providers and their provenance is written onto the snapshot; nothing
   * a caller passes here can move the number.
   */
  async strikeDealingPoint(
    strategyId: string,
    reason: string,
    actorId: string,
  ): Promise<DealingPointResult> {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id: strategyId },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    // ── 1. Value the pool, before any flow touches it ──
    // The NAV engine sources every price and records where it came from.
    const unitsBefore = strategy.totalUnits;
    const snapshot = await this.nav.strikeSnapshot(strategyId, true);
    const poolNavBefore = snapshot.poolNav;
    const navPerUnit = snapshot.navPerUnit;

    if (navPerUnit.lessThanOrEqualTo(0)) {
      // A pool worth nothing while units exist cannot price a deal: issuing units at zero would
      // hand out an unbounded claim, and redeeming at zero would wipe out holders silently.
      throw new BadRequestException({
        code: 'UNPRICEABLE_POOL',
        message: 'Pool NAV is zero or negative while units are outstanding; a dealing point cannot be struck.',
      });
    }

    // ── 2. Bring fee accruals up to the price just struck ──
    // Before any units move, and at this exact price. A redeeming investor's fee and their
    // redemption proceeds must be measured off one number; accruing afterwards would price the
    // fee against a position that has already been partly cancelled. Accruing before
    // subscriptions also keeps a brand-new position out of it — it has no period to charge for.
    await this.fees.accrueAtPrice(strategy, navPerUnit);

    // ── 3. Subscriptions, at the price struck above ──
    const subscriptionsSettled = await this.settleSubscriptions(strategy, snapshot.id, navPerUnit);

    // ── 4. Redemptions, at the same price, net of the fee accrued above ──
    const { settled: redemptionsSettled, queued: redemptionsQueued } = await this.settleRedemptions(
      strategy,
      snapshot.id,
      navPerUnit,
    );

    const after = await this.prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId,
      action: 'investment.dealing_point_struck',
      entityType: 'NavSnapshot',
      entityId: snapshot.id,
      metadata: {
        strategy: strategy.slug,
        navPerUnit: formatAmount(navPerUnit),
        poolNav: formatAmount(poolNavBefore),
        reason,
        markSource: snapshot.markSource,
        subscriptionsSettled,
        redemptionsSettled,
        redemptionsQueued,
      },
    });

    return {
      snapshotId: snapshot.id,
      navPerUnit: formatAmount(navPerUnit),
      poolNav: formatAmount(poolNavBefore),
      totalUnits: formatAmount(after.totalUnits),
      subscriptionsSettled,
      redemptionsSettled,
      redemptionsQueued,
    };
  }

  // ── Settlement ──────────────────────────────────────────────────────────

  private async settleSubscriptions(
    strategy: { id: string; slug: string; name: string; baseAssetId: string; lockupDays: number; baseAsset: { symbol: string } },
    snapshotId: string,
    navPerUnit: Prisma.Decimal,
  ): Promise<number> {
    const pending = await this.prisma.subscriptionRequest.findMany({
      where: { strategyId: strategy.id, status: SubscriptionRequestStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });

    let settled = 0;
    for (const request of pending) {
      const units = quantize(request.amount.dividedBy(navPerUnit));

      // Cash crosses from the investor's own pending bucket into the pool. This is the moment
      // ownership changes: they stop holding currency and start holding a claim on the pool.
      await this.ledger.post({
        type: LedgerTransactionType.SUBSCRIPTION_SETTLEMENT,
        idempotencyKey: `subscription-settle:${request.id}`,
        referenceType: 'SubscriptionRequest',
        referenceId: request.id,
        metadata: { navPerUnit: formatAmount(navPerUnit), snapshotId },
        legs: [
          {
            userId: request.userId,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.PENDING_SUBSCRIPTION,
            amount: exactNeg(request.amount),
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId: strategy.id,
            amount: request.amount,
          },
        ],
      });

      const lockedUntil =
        strategy.lockupDays > 0
          ? new Date(Date.now() + strategy.lockupDays * 24 * 60 * 60 * 1000)
          : null;

      // The unit register and the strategy's total must move together, or Σ units would stop
      // equalling totalUnits and every derived number would be wrong.
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.investmentPosition.findUnique({
          where: { userId_strategyId: { userId: request.userId, strategyId: strategy.id } },
        });

        if (existing) {
          await tx.investmentPosition.update({
            where: { id: existing.id },
            data: {
              units: exactSum(existing.units, units),
              costBasis: exactSum(existing.costBasis, request.amount),
              // A top-up must not reset the high water mark downward — that would re-charge
              // performance the investor has already paid for. Keep the higher of the two.
              hwmUnitPrice: existing.hwmUnitPrice.greaterThan(navPerUnit)
                ? existing.hwmUnitPrice
                : navPerUnit,
              // A new lock-up applies to the new money; the later date governs.
              lockedUntil:
                lockedUntil && (!existing.lockedUntil || lockedUntil > existing.lockedUntil)
                  ? lockedUntil
                  : existing.lockedUntil,
            },
          });
        } else {
          await tx.investmentPosition.create({
            data: {
              userId: request.userId,
              strategyId: strategy.id,
              units,
              costBasis: request.amount,
              hwmUnitPrice: navPerUnit,
              lockedUntil,
            },
          });
        }

        await adjustTotalUnits(tx, strategy.id, units);

        await tx.subscriptionRequest.update({
          where: { id: request.id },
          data: {
            status: SubscriptionRequestStatus.SETTLED,
            settledSnapshotId: snapshotId,
            unitsIssued: units,
            settledAt: new Date(),
          },
        });
      });

      await this.notifications.notify({
        userId: request.userId,
        type: NotificationType.INVESTMENT,
        title: 'Investment settled',
        body: `${formatAmount(request.amount)} ${strategy.baseAsset.symbol} bought ${formatAmount(units)} units of ${strategy.name} at ${formatAmount(navPerUnit)} per unit.`,
      });

      settled++;
    }

    return settled;
  }

  private async settleRedemptions(
    strategy: { id: string; slug: string; name: string; baseAssetId: string; baseAsset: { symbol: string } },
    snapshotId: string,
    navPerUnit: Prisma.Decimal,
  ): Promise<{ settled: number; queued: number }> {
    const now = new Date();
    const due = await this.prisma.redemptionRequest.findMany({
      where: {
        strategyId: strategy.id,
        status: { in: [RedemptionRequestStatus.PENDING, RedemptionRequestStatus.QUEUED] },
        eligibleFrom: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
    });

    let settled = 0;
    let queued = 0;

    for (const request of due) {
      const gross = quantize(request.units.times(navPerUnit));

      const position = await this.prisma.investmentPosition.findUnique({
        where: { userId_strategyId: { userId: request.userId, strategyId: strategy.id } },
      });
      if (!position) {
        // A redemption with no position behind it cannot be priced against anything. Skipping is
        // the only honest response; paying it would be creating a claim from nowhere.
        this.logger.error(`Redemption ${request.id} has no position; skipping.`);
        continue;
      }

      // The whole gross amount has to leave the pool — the fee is carved out of it, not charged
      // on top — so the cash check is against gross, and it happens before a single posting.
      // Taking the fee and then discovering the payout cannot be funded would leave the investor
      // charged for a redemption that never settled.
      const poolCash = await this.poolCash(strategy.id, strategy.baseAssetId);
      if (poolCash.lessThan(gross)) {
        // Queued, not part-paid and not covered from platform funds. Paying an investor out of
        // the platform's own money would convert a pool shortfall into a hidden platform loss
        // and disguise the real problem (docs/14 step 8).
        if (request.status !== RedemptionRequestStatus.QUEUED) {
          await this.prisma.redemptionRequest.update({
            where: { id: request.id },
            data: { status: RedemptionRequestStatus.QUEUED },
          });
          this.logger.warn(
            `Redemption ${request.id} queued: pool holds ${formatAmount(poolCash)} ${strategy.baseAsset.symbol}, ` +
              `needs ${formatAmount(gross)}. The manager must raise cash.`,
          );
        }
        queued++;
        continue;
      }

      // Settled as its own FEE_CRYSTALLISATION posting rather than as a third leg on the
      // redemption. The ledger's ownership boundary permits only a named set of transaction
      // types to move value between investor-owned and platform-owned accounts, and
      // REDEMPTION_SETTLEMENT is deliberately not one of them — if it were, "a redemption"
      // would be a general-purpose way to move investor money to the platform (docs/12 §1.1).
      const { fee: fees } = await this.fees.settleRedemptionFee({
        positionId: position.id,
        strategy,
        unitsRedeemed: request.units,
        navPerUnit,
        redemptionId: request.id,
      });
      const net = exactDiff(gross, fees);

      await this.ledger.post({
        type: LedgerTransactionType.REDEMPTION_SETTLEMENT,
        idempotencyKey: `redemption-settle:${request.id}`,
        referenceType: 'RedemptionRequest',
        referenceId: request.id,
        metadata: { navPerUnit: formatAmount(navPerUnit), snapshotId },
        legs: [
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId: strategy.id,
            amount: exactNeg(net),
          },
          {
            userId: request.userId,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.AVAILABLE,
            amount: net,
          },
        ],
      });

      await this.prisma.$transaction(async (tx) => {
        const position = await tx.investmentPosition.findUniqueOrThrow({
          where: { userId_strategyId: { userId: request.userId, strategyId: strategy.id } },
        });

        // Capital is returned in proportion to the units cancelled, so the remaining cost basis
        // still describes what the remaining units cost.
        const proportion = request.units.dividedBy(position.units);
        const basisReturned = quantize(position.costBasis.times(proportion));

        await tx.investmentPosition.update({
          where: { id: position.id },
          data: {
            units: exactDiff(position.units, request.units),
            costBasis: exactDiff(position.costBasis, basisReturned),
          },
        });

        await adjustTotalUnits(tx, strategy.id, exactNeg(request.units));

        await tx.redemptionRequest.update({
          where: { id: request.id },
          data: {
            status: RedemptionRequestStatus.SETTLED,
            settledSnapshotId: snapshotId,
            grossAmount: gross,
            feesCharged: fees,
            netAmount: net,
            settledAt: new Date(),
          },
        });
      });

      await this.notifications.notify({
        userId: request.userId,
        type: NotificationType.INVESTMENT,
        title: 'Redemption settled',
        body: `${formatAmount(request.units)} units of ${strategy.name} redeemed at ${formatAmount(navPerUnit)} — ${formatAmount(net)} ${strategy.baseAsset.symbol} is back in your wallet.`,
      });

      settled++;
    }

    return { settled, queued };
  }

  private async poolCash(strategyId: string, assetId: string): Promise<Prisma.Decimal> {
    const balance = await this.prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return balance?.amount ?? new Prisma.Decimal(0);
  }
}
