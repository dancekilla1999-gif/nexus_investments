import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditActorType,
  LedgerAccountType,
  LedgerTransactionType,
  NotificationType,
  Prisma,
  RedemptionRequestStatus,
  StrategyStatus,
  SubscriptionRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { formatAmount } from '../ledger/amount.util';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { apportion, sumApportioned } from './apportion';

export interface ExposureLine {
  assetSymbol: string;
  assetId: string;
  /** The holder's share of the pool's holding of this asset. */
  amount: string;
  /** Share of pool NAV, in basis points, for the "BTC 35%" display. */
  weightBps: number;
}

export interface FlowNetting {
  strategySlug: string;
  baseAssetSymbol: string;
  subscriptionsIn: string;
  redemptionsOut: string;
  /** Positive = cash arriving to deploy. Negative = cash the manager must raise. */
  net: string;
  poolCashAvailable: string;
  /** Zero unless the pool cannot cover the redemptions due at the next dealing point. */
  cashShortfall: string;
  pendingSubscriptions: number;
  dueRedemptions: number;
}

/**
 * The Allocation Engine (docs/12 §7).
 *
 * Under `POOLED_NAV` this is deliberately **not** a fan-out of orders to N sub-accounts — that
 * is the `SEGREGATED_COPY` model, which is not built. Here it does three things:
 *
 *   1. **Derived exposure** — project the pool's holdings onto each investor by unit share, for
 *      the "BTC 35% / ETH 25%" view an investor expects and for per-investor risk reporting.
 *   2. **Flow netting** — at a dealing point, tell the manager how much cash is arriving and how
 *      much must be raised, so positions can be scaled without disadvantaging either side.
 *   3. **Wind-down** — distribute a closing strategy's proceeds strictly pro rata, with no
 *      discretion available to any operator.
 *
 * Every split goes through `apportion`, so the parts sum to the whole exactly. A projection
 * whose parts do not add up is either showing value to nobody or showing it to two people at
 * once, and it is recomputed on every read — so a discrepancy is not a one-off, it is permanent.
 */
@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── 1. Derived exposure ─────────────────────────────────────────────────

  /**
   * What one investor's units entitle them to, asset by asset.
   *
   * Derived on read rather than stored: a stored copy would need updating on every fill and
   * every subscription, and the moment it drifted the investor would be looking at a number
   * nothing else in the system agrees with.
   */
  async exposureForInvestor(userId: string, strategyId: string): Promise<ExposureLine[]> {
    const all = await this.exposureForAll(strategyId);
    return all.get(userId) ?? [];
  }

  /**
   * Every investor's exposure in one pass.
   *
   * Computed together, not per investor, because exactness is a property of the *set*: the
   * apportionment has to see all the weights at once to know who the remainder belongs to.
   * Calling a single-investor function in a loop would give each holder a plausible number and
   * a total that does not match the pool.
   */
  async exposureForAll(strategyId: string): Promise<Map<string, ExposureLine[]>> {
    const strategy = await this.prisma.investmentStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    const positions = await this.prisma.investmentPosition.findMany({
      where: { strategyId, units: { gt: 0 } },
      select: { userId: true, units: true },
    });

    const holdings = await this.prisma.balance.findMany({
      where: { type: LedgerAccountType.STRATEGY_POOL, ledgerAccount: { strategyId }, amount: { gt: 0 } },
      include: { asset: true },
    });

    const result = new Map<string, ExposureLine[]>();
    if (positions.length === 0 || holdings.length === 0) return result;

    // Weight by units, not by cost basis: two investors who paid different prices for the same
    // number of units own the same share of the pool today, and that is what exposure means.
    const weights = positions.map((p) => ({ key: p.userId, weight: p.units }));

    // NAV is only needed for the percentage display, and only the base asset is markable until
    // MVP15. Percentages fall back to a share of the *base asset* total, which is honest for a
    // cash-only pool and is replaced by real marks when the NAV engine lands.
    const totalPoolValue = holdings
      .filter((h) => h.assetId === strategy.baseAssetId)
      .reduce((acc, h) => acc.plus(h.amount), new Prisma.Decimal(0));

    for (const holding of holdings) {
      const split = apportion(holding.amount, weights, holding.asset.decimals);

      // The invariant, checked rather than assumed: this runs on every read, so a silent
      // discrepancy would be permanent rather than transient.
      const distributed = sumApportioned(split);
      if (!distributed.equals(holding.amount)) {
        throw new Error(
          `Allocation of ${holding.asset.symbol} does not reconcile: distributed ` +
            `${formatAmount(distributed)} of ${formatAmount(holding.amount)}`,
        );
      }

      for (const part of split) {
        const lines = result.get(part.key) ?? [];
        lines.push({
          assetId: holding.assetId,
          assetSymbol: holding.asset.symbol,
          amount: formatAmount(part.amount),
          weightBps:
            holding.assetId === strategy.baseAssetId && !totalPoolValue.isZero()
              ? Math.round(part.amount.dividedBy(totalPoolValue).times(10000).toNumber())
              : 0,
        });
        result.set(part.key, lines);
      }
    }

    return result;
  }

  // ── 2. Flow netting ─────────────────────────────────────────────────────

  /**
   * What the next dealing point will do to the pool's cash, before it happens.
   *
   * The manager needs this to decide whether to raise cash: discovering a shortfall *during*
   * settlement means queueing a redemption an investor was told to expect.
   */
  async netFlows(strategyId: string): Promise<FlowNetting> {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id: strategyId },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    const subscriptions = await this.prisma.subscriptionRequest.aggregate({
      where: { strategyId, status: SubscriptionRequestStatus.PENDING },
      _sum: { amount: true },
      _count: true,
    });

    const dueRedemptions = await this.prisma.redemptionRequest.findMany({
      where: {
        strategyId,
        status: { in: [RedemptionRequestStatus.PENDING, RedemptionRequestStatus.QUEUED] },
        eligibleFrom: { lte: new Date() },
      },
      select: { units: true },
    });

    const poolCash = await this.poolCash(strategyId, strategy.baseAssetId);

    // Redemptions are denominated in units, so their cash value depends on the NAV that has not
    // been struck yet. Valuing them at the *current* implied price is an estimate and is
    // labelled as one — the actual figure is fixed at the dealing point.
    const impliedNavPerUnit = strategy.totalUnits.isZero()
      ? new Prisma.Decimal(1)
      : poolCash.dividedBy(strategy.totalUnits);
    const redemptionUnits = dueRedemptions.reduce((acc, r) => acc.plus(r.units), new Prisma.Decimal(0));
    const redemptionsOut = redemptionUnits.times(impliedNavPerUnit);

    const subscriptionsIn = subscriptions._sum.amount ?? new Prisma.Decimal(0);
    const net = subscriptionsIn.minus(redemptionsOut);

    // Subscription cash is not in the pool yet, so it cannot fund a redemption at the same
    // dealing point unless it settles first — which it does (docs/12 §7). Counting it here is
    // therefore correct, and counting it *twice* would understate the shortfall.
    const availableAfterSubscriptions = poolCash.plus(subscriptionsIn);
    const shortfall = redemptionsOut.greaterThan(availableAfterSubscriptions)
      ? redemptionsOut.minus(availableAfterSubscriptions)
      : new Prisma.Decimal(0);

    return {
      strategySlug: strategy.slug,
      baseAssetSymbol: strategy.baseAsset.symbol,
      subscriptionsIn: formatAmount(subscriptionsIn),
      redemptionsOut: formatAmount(redemptionsOut),
      net: formatAmount(net),
      poolCashAvailable: formatAmount(poolCash),
      cashShortfall: formatAmount(shortfall),
      pendingSubscriptions: subscriptions._count,
      dueRedemptions: dueRedemptions.length,
    };
  }

  // ── 3. Wind-down ────────────────────────────────────────────────────────

  /**
   * Closes a strategy and returns everything to its investors, strictly pro rata.
   *
   * No operator input beyond "do it": there is no amount, no recipient and no ordering to
   * choose. That is the point — a wind-down is the moment where discretion would be most
   * valuable to someone dishonest and least defensible afterwards.
   *
   * Requires `WINDING_DOWN`, which is a deliberate two-step: a strategy must first be closed to
   * new capital and have its positions liquidated to cash, and only then distributed.
   */
  async windDown(strategyId: string, actorId: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id: strategyId },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    if (strategy.status !== StrategyStatus.WINDING_DOWN) {
      throw new BadRequestException({
        code: 'NOT_WINDING_DOWN',
        message:
          'A strategy must be set to WINDING_DOWN, and its positions liquidated to cash, before proceeds can be distributed.',
      });
    }

    // Every non-base holding must be gone. Distributing cash while the pool still holds an
    // unmarkable asset would hand investors part of what they own and silently keep the rest.
    const holdings = await this.prisma.balance.findMany({
      where: { type: LedgerAccountType.STRATEGY_POOL, ledgerAccount: { strategyId }, amount: { gt: 0 } },
      include: { asset: true },
    });
    const unliquidated = holdings.filter((h) => h.assetId !== strategy.baseAssetId);
    if (unliquidated.length > 0) {
      throw new BadRequestException({
        code: 'POSITIONS_NOT_LIQUIDATED',
        message: `Pool still holds ${unliquidated
          .map((h) => `${formatAmount(h.amount)} ${h.asset.symbol}`)
          .join(', ')}. Liquidate to ${strategy.baseAsset.symbol} before distributing.`,
      });
    }

    const positions = await this.prisma.investmentPosition.findMany({
      where: { strategyId, units: { gt: 0 } },
    });
    if (positions.length === 0) {
      throw new BadRequestException({
        code: 'NO_POSITIONS',
        message: 'This strategy has no outstanding units to distribute to.',
      });
    }

    const poolCash = await this.poolCash(strategyId, strategy.baseAssetId);
    const split = apportion(
      poolCash,
      positions.map((p) => ({ key: p.userId, weight: p.units })),
      strategy.baseAsset.decimals,
    );

    const distributed = sumApportioned(split);
    if (!distributed.equals(poolCash)) {
      throw new Error(
        `Wind-down does not reconcile: distributing ${formatAmount(distributed)} of ${formatAmount(poolCash)}`,
      );
    }

    const byUser = new Map(split.map((s) => [s.key, s.amount]));
    let paid = 0;

    for (const position of positions) {
      const amount = byUser.get(position.userId) ?? new Prisma.Decimal(0);

      if (amount.greaterThan(0)) {
        await this.ledger.post({
          type: LedgerTransactionType.REDEMPTION_SETTLEMENT,
          idempotencyKey: `winddown:${strategyId}:${position.userId}`,
          referenceType: 'InvestmentStrategy',
          referenceId: strategyId,
          metadata: { windDown: true, units: formatAmount(position.units) },
          legs: [
            {
              userId: PLATFORM_SYSTEM_USER_ID,
              assetId: strategy.baseAssetId,
              type: LedgerAccountType.STRATEGY_POOL,
              strategyId,
              amount: amount.negated(),
            },
            {
              userId: position.userId,
              assetId: strategy.baseAssetId,
              type: LedgerAccountType.AVAILABLE,
              amount,
            },
          ],
        });
      }

      await this.prisma.investmentPosition.update({
        where: { id: position.id },
        data: { units: 0, costBasis: 0 },
      });

      await this.notifications.notify({
        userId: position.userId,
        type: NotificationType.INVESTMENT,
        title: `${strategy.name} has closed`,
        body: `Your ${formatAmount(position.units)} units were redeemed pro rata for ${formatAmount(amount)} ${strategy.baseAsset.symbol}.`,
      });

      paid++;
    }

    const closed = await this.prisma.investmentStrategy.update({
      where: { id: strategyId },
      data: { status: StrategyStatus.CLOSED, totalUnits: 0, closedAt: new Date() },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'investment.strategy_wound_down',
      entityType: 'InvestmentStrategy',
      entityId: strategyId,
      metadata: {
        distributed: formatAmount(poolCash),
        investorsPaid: paid,
        asset: strategy.baseAsset.symbol,
      },
    });

    return {
      strategySlug: closed.slug,
      distributed: formatAmount(poolCash),
      investorsPaid: paid,
      assetSymbol: strategy.baseAsset.symbol,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async poolCash(strategyId: string, assetId: string): Promise<Prisma.Decimal> {
    const balance = await this.prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return balance?.amount ?? new Prisma.Decimal(0);
  }
}
