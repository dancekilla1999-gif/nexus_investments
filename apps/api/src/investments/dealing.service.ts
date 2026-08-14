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
import { formatAmount } from '../ledger/amount.util';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { NavService } from '../nav/nav.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** The scale the database stores money and units at — `Decimal(36, 18)`. */
const STORED_DP = 18;

/**
 * Rounds to the precision the database actually stores, **downward**, before a value is used
 * anywhere.
 *
 * Two reasons, and the first is a bug this codebase already had. Decimal.js keeps ~20
 * significant digits, so `400 / 1.2` is a repeating decimal that gets rounded once when a
 * position row is written and *again*, differently, when the same value is added into
 * `totalUnits` — Postgres rounds the accumulated sum, not each addend. The two disagree by
 * ~1e-17 per deal, `Σ units == totalUnits` stops holding, and every per-investor figure derived
 * from it is quietly wrong. Quantising once, here, means both sides store the identical number.
 *
 * Downward specifically: issuing *more* units than the money paid for dilutes every existing
 * holder, and paying out more than a claim is worth takes it from the ones who stay. Rounding
 * down leaves a sub-wei residue in the pool, which is the only direction that harms nobody.
 */
function quantize(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(STORED_DP, Prisma.Decimal.ROUND_DOWN);
}

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

    // ── 2. Subscriptions, at the price struck above ──
    const subscriptionsSettled = await this.settleSubscriptions(strategy, snapshot.id, navPerUnit);

    // ── 3. Redemptions, at the same price ──
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
            amount: request.amount.negated(),
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
              units: existing.units.plus(units),
              costBasis: existing.costBasis.plus(request.amount),
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

        await this.adjustTotalUnits(tx, strategy.id, units);

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

      // Fees are MVP17; until the fee engine exists there is nothing accrued to deduct, and
      // pretending otherwise would misreport what the investor receives.
      const fees = new Prisma.Decimal(0);
      const net = gross.minus(fees);

      const poolCash = await this.poolCash(strategy.id, strategy.baseAssetId);
      if (poolCash.lessThan(net)) {
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
              `needs ${formatAmount(net)}. The manager must raise cash.`,
          );
        }
        queued++;
        continue;
      }

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
            amount: net.negated(),
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
            units: position.units.minus(request.units),
            costBasis: position.costBasis.minus(basisReturned),
          },
        });

        await this.adjustTotalUnits(tx, strategy.id, request.units.negated());

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

  /**
   * Moves `totalUnits` by an exact Decimal delta, under a row lock.
   *
   * Deliberately not Prisma's `{ increment }`: that hands the arithmetic to the driver, which
   * does not preserve full decimal precision, so `Σ position.units` and `strategy.totalUnits`
   * drifted apart by ~1e-17 on any deal whose unit price does not divide evenly. Doing the
   * addition here, in Decimal, means both sides store the identical number by construction.
   *
   * The `FOR UPDATE` lock serialises concurrent settlements against the same strategy — a
   * read-modify-write on a shared counter is exactly the shape that silently loses updates.
   */
  private async adjustTotalUnits(
    tx: Prisma.TransactionClient,
    strategyId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    const [locked] = await tx.$queryRaw<Array<{ totalUnits: Prisma.Decimal }>>`
      SELECT "totalUnits" FROM investment_strategies WHERE id = ${strategyId} FOR UPDATE
    `;
    const next = new Prisma.Decimal(locked.totalUnits).plus(delta);
    await tx.investmentStrategy.update({
      where: { id: strategyId },
      data: { totalUnits: next },
    });
  }

  private async poolCash(strategyId: string, assetId: string): Promise<Prisma.Decimal> {
    const balance = await this.prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return balance?.amount ?? new Prisma.Decimal(0);
  }
}
