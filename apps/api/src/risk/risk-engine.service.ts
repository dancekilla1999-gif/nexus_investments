import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  AuditActorType,
  InvestmentStrategy,
  LedgerAccountType,
  Prisma,
  RiskEventType,
  StrategyStatus,
} from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { HighPrecision } from '../ledger/amount.util';
import { MarkRegistry, NoMarkError, StaleMarkError } from '../nav/mark.registry';
import { NavService } from '../nav/nav.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmergencyControlsService } from './emergency-controls.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown by `checkOrder`; carries a stable code so callers (and tests) don't parse prose. */
export class RiskCheckFailedError extends Error {
  constructor(
    readonly checkCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'RiskCheckFailedError';
  }
}

export interface OrderIntent {
  strategyId: string;
  fromAssetId: string;
  toAssetId: string;
  fromQuantity: Prisma.Decimal;
}

/**
 * The pre-trade pipeline (MVP19, docs/12 §9): "Self-trading and managed trading go through the
 * same engine. There is no privileged path." Only `TradingService` calls this today — MVP4's
 * self-trading has no order path to check yet — but nothing here is strategy-terminal-specific,
 * so a future self-trade order can call the same `checkOrder`.
 *
 * Implemented: global pause, strategy status, mandate (asset allow-list), exposure concentration,
 * drawdown / circuit breaker, daily loss limit. Deliberately not implemented, and why:
 *
 * - **Leverage.** `maxLeverageBps` exists on `InvestmentStrategy` but nothing in the platform can
 *   actually leverage a position yet (no margin, no derivatives) — every position is definitionally
 *   spot, 1x. Checking a fixed 1x against a configurable cap either always passes (cap ≥ 10000bps)
 *   or always fails for a meaningless reason (cap < 10000bps, which cannot be satisfied by any
 *   spot trade). Both are worse than not checking. Revisit once a real leverage mechanism exists.
 * - **Liquidity** ("can this size actually be filled here?") and **volatility / correlated
 *   exposure** need order-book depth and a return-correlation history this platform does not
 *   ingest yet (MVP22, MVP39). Checking them against nothing would mean always passing, which is
 *   indistinguishable from not having the check — worse than being honest that it is absent.
 */
@Injectable()
export class RiskEngineService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RiskEngineService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly nav: NavService,
    private readonly marks: MarkRegistry,
    private readonly config: AppConfigService,
    private readonly emergency: EmergencyControlsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.riskDrawdownSweepEnabled) {
      this.logger.log('Scheduled drawdown sweep disabled by configuration.');
      return;
    }
    const interval = this.config.riskDrawdownSweepIntervalMs;
    this.timer = setInterval(() => void this.sweepDrawdownChecks(), interval);
    this.timer.unref?.();
    this.logger.log(`Drawdown sweep started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Pre-trade pipeline ────────────────────────────────────────────────

  /** Throws `RiskCheckFailedError` on the first check that fails. Silent return means "clear to trade." */
  async checkOrder(intent: OrderIntent): Promise<void> {
    if (await this.emergency.isActive('GLOBAL_TRADING_PAUSE')) {
      throw new RiskCheckFailedError('GLOBAL_TRADING_PAUSE', 'Trading is paused platform-wide.');
    }

    const strategy = await this.prisma.investmentStrategy.findUniqueOrThrow({
      where: { id: intent.strategyId },
    });

    // Re-checked here, not only at placement: a scheduled fill (LIMIT/STOP via the sweep) can
    // run long after placement, and the strategy's status — including a circuit breaker tripped
    // by this very method's own scheduled sweep — may have changed in between.
    if (strategy.status !== StrategyStatus.OPEN && strategy.status !== StrategyStatus.SOFT_CLOSED) {
      // A CIRCUIT_BROKEN strategy still allows de-risking: moving back toward the strategy's own
      // base asset reduces exposure, not increases it, and docs/12 §9 blocks only "new
      // risk-increasing orders."
      const isDeRisking = strategy.status === StrategyStatus.CIRCUIT_BROKEN && intent.toAssetId === strategy.baseAssetId;
      if (!isDeRisking) {
        throw new RiskCheckFailedError(
          'STRATEGY_NOT_TRADEABLE',
          `A strategy in status ${strategy.status} cannot take a risk-increasing order.`,
        );
      }
    }

    await this.checkMandate(strategy, intent);
    await this.checkExposure(strategy, intent);
    await this.checkDrawdown(strategy);
    await this.checkDailyLossLimit(strategy);
  }

  private async checkMandate(strategy: InvestmentStrategy, intent: OrderIntent): Promise<void> {
    const allowed = await this.prisma.strategyAllowedAsset.findMany({
      where: { strategyId: strategy.id },
      select: { assetId: true },
    });
    if (allowed.length === 0) return; // No mandate configured — every enabled asset is tradeable.

    const allowedIds = new Set(allowed.map((a) => a.assetId));
    allowedIds.add(strategy.baseAssetId); // A strategy can always hold its own settlement asset.

    for (const [role, assetId] of [
      ['fromAsset', intent.fromAssetId],
      ['toAsset', intent.toAssetId],
    ] as const) {
      if (!allowedIds.has(assetId)) {
        throw new RiskCheckFailedError(
          'ASSET_NOT_MANDATED',
          `This strategy's mandate does not permit trading ${role} ${assetId}.`,
        );
      }
    }
  }

  /**
   * Projects what this order would leave the pool holding of `toAsset`, as a share of AUM, and
   * blocks it if that share would exceed `maxAssetExposureBps`. The value added is the value
   * being *given up* (`fromQuantity` of `fromAsset`, priced into the strategy's base asset) —
   * not `fromQuantity × fromAsset→toAsset rate`, which is a quantity of `toAsset`, not a value,
   * and comparing a raw token quantity against a base-asset-denominated `poolNav` silently under-
   * or over-counted exposure by whatever `toAsset`'s own unit price happens to be. A fair-value
   * swap gives up and receives (approximately) the same base-asset value on both legs, so pricing
   * either side gives the same answer; `fromAsset` is priced here because every asset the pool
   * could plausibly hold already has a base-asset rate (it does, or the pool could not have been
   * valued to fund this order in the first place), which is not guaranteed for an arbitrary
   * `toAsset` the strategy has never held.
   */
  private async checkExposure(strategy: InvestmentStrategy, intent: OrderIntent): Promise<void> {
    if (strategy.maxAssetExposureBps >= 10000) return; // 100% cap = unconfigured, nothing to check.

    const valuation = await this.nav.valuePool(strategy.id);
    if (valuation.poolNav.isZero()) return; // An empty pool cannot be over-concentrated.

    const currentToAssetValue = await this.holdingValueInBase(strategy, intent.toAssetId);
    const addedValue = await this.valueInBase(strategy, intent.fromAssetId, intent.fromQuantity);

    const projected = currentToAssetValue.plus(addedValue);
    const projectedBps = projected.dividedBy(new HighPrecision(valuation.poolNav.toString())).times(10000);

    if (projectedBps.greaterThan(strategy.maxAssetExposureBps)) {
      throw new RiskCheckFailedError(
        'EXPOSURE_LIMIT',
        `This order would take exposure to ${intent.toAssetId} to ~${projectedBps.toDecimalPlaces(0)}bps, ` +
          `above the strategy's ${strategy.maxAssetExposureBps}bps limit.`,
      );
    }
  }

  /** What the pool currently holds of `assetId`, valued in the strategy's own base asset. */
  private async holdingValueInBase(
    strategy: InvestmentStrategy,
    assetId: string,
  ): Promise<InstanceType<typeof HighPrecision>> {
    const balance = await this.prisma.balance.findFirst({
      where: { assetId, type: LedgerAccountType.STRATEGY_POOL, ledgerAccount: { strategyId: strategy.id } },
    });
    if (!balance || balance.amount.isZero()) return new HighPrecision(0);
    return this.valueInBase(strategy, assetId, balance.amount);
  }

  /** `quantity` of `assetId`, priced into the strategy's own base asset. */
  private async valueInBase(
    strategy: InvestmentStrategy,
    assetId: string,
    quantity: Prisma.Decimal,
  ): Promise<InstanceType<typeof HighPrecision>> {
    const amount = new HighPrecision(quantity.toString());
    if (assetId === strategy.baseAssetId) return amount;
    const mark = await this.marks.requireMark(assetId, strategy.baseAssetId);
    return amount.times(new HighPrecision(mark.price.toString()));
  }

  // ── Drawdown / circuit breaker ────────────────────────────────────────

  /**
   * Trips the breaker if `navPerUnit` has fallen to or below the strategy's own historical peak
   * × (1 − maxDrawdownBps/10000). Called from the pre-trade pipeline (order-triggered) and from
   * `sweepDrawdownChecks` (continuous — "a drawdown breach is noticed when it happens rather
   * than at the next deal", `NavService.revalueAll`'s own doc comment). Idempotent: tripping an
   * already-CIRCUIT_BROKEN strategy again is a no-op, not a second RiskEvent.
   */
  private async checkDrawdown(strategy: InvestmentStrategy): Promise<void> {
    if (strategy.status === StrategyStatus.CIRCUIT_BROKEN) {
      throw new RiskCheckFailedError('CIRCUIT_BROKEN', 'This strategy is circuit-broken.');
    }
    if (strategy.totalUnits.isZero()) return; // No units, no navPerUnit, nothing to measure.

    const valuation = await this.nav.valuePool(strategy.id);
    const navPerUnit = new HighPrecision(valuation.poolNav.toString()).dividedBy(
      new HighPrecision(strategy.totalUnits.toString()),
    );

    const peakRow = await this.prisma.navSnapshot.aggregate({
      where: { strategyId: strategy.id },
      _max: { navPerUnit: true },
    });
    const peak = peakRow._max.navPerUnit
      ? new HighPrecision(peakRow._max.navPerUnit.toString())
      : navPerUnit; // No snapshot history yet — this valuation is its own first data point.

    const floor = peak.times(new HighPrecision(10000 - strategy.maxDrawdownBps).dividedBy(10000));
    if (navPerUnit.greaterThan(floor)) return;

    await this.tripCircuitBreaker(strategy, navPerUnit, peak);
    throw new RiskCheckFailedError('CIRCUIT_BROKEN', 'This order would breach the strategy\'s maximum drawdown.');
  }

  private async tripCircuitBreaker(
    strategy: InvestmentStrategy,
    navPerUnit: InstanceType<typeof HighPrecision>,
    peak: InstanceType<typeof HighPrecision>,
  ): Promise<void> {
    const fresh = await this.prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategy.id } });
    if (fresh.status === StrategyStatus.CIRCUIT_BROKEN) return; // Already tripped — no double event.

    await this.prisma.investmentStrategy.update({
      where: { id: strategy.id },
      data: { status: StrategyStatus.CIRCUIT_BROKEN },
    });

    await this.prisma.riskEvent.create({
      data: {
        type: RiskEventType.STRATEGY_CIRCUIT_BREAKER,
        severity: 5,
        details: {
          strategyId: strategy.id,
          slug: strategy.slug,
          navPerUnit: navPerUnit.toFixed(18),
          peakNavPerUnit: peak.toFixed(18),
          maxDrawdownBps: strategy.maxDrawdownBps,
        },
      },
    });

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      action: 'risk.circuit_breaker_tripped',
      entityType: 'InvestmentStrategy',
      entityId: strategy.id,
      metadata: { navPerUnit: navPerUnit.toFixed(18), peakNavPerUnit: peak.toFixed(18) },
    });

    this.logger.warn(`Circuit breaker tripped for strategy ${strategy.slug} (${strategy.id}).`);
  }

  /** Runs the drawdown check for every live strategy, independent of any order being placed. */
  async sweepDrawdownChecks(): Promise<void> {
    const strategies = await this.prisma.investmentStrategy.findMany({
      where: { status: { in: [StrategyStatus.OPEN, StrategyStatus.SOFT_CLOSED] } },
    });
    for (const strategy of strategies) {
      try {
        await this.checkDrawdown(strategy);
      } catch (err) {
        if (err instanceof RiskCheckFailedError) continue; // Expected path: it just tripped.
        if (err instanceof NoMarkError || err instanceof StaleMarkError) continue; // Transient.
        this.logger.error(`Drawdown sweep failed for ${strategy.slug}: ${(err as Error).message}`);
      }
    }
  }

  // ── Daily loss limit ────────────────────────────────────────────────────

  private async checkDailyLossLimit(strategy: InvestmentStrategy): Promise<void> {
    if (strategy.dailyLossLimitBps == null) return;

    const dayAgo = new Date(Date.now() - DAY_MS);
    const [current, past] = await Promise.all([
      this.nav.valuePool(strategy.id),
      this.prisma.navSnapshot.findFirst({
        where: { strategyId: strategy.id, struckAt: { lte: dayAgo } },
        orderBy: { struckAt: 'desc' },
      }),
    ]);
    if (!past || past.poolNav.isZero()) return; // No ~24h-old baseline yet — nothing to compare.

    const currentNav = new HighPrecision(current.poolNav.toString());
    const pastNav = new HighPrecision(past.poolNav.toString());
    if (currentNav.greaterThanOrEqualTo(pastNav)) return; // No loss.

    const lossBps = pastNav.minus(currentNav).dividedBy(pastNav).times(10000);
    if (lossBps.lessThan(strategy.dailyLossLimitBps)) return;

    await this.prisma.riskEvent.create({
      data: {
        type: RiskEventType.STRATEGY_RISK_LIMIT_BREACH,
        severity: 4,
        details: {
          strategyId: strategy.id,
          slug: strategy.slug,
          check: 'DAILY_LOSS_LIMIT',
          lossBps: lossBps.toDecimalPlaces(2).toString(),
          dailyLossLimitBps: strategy.dailyLossLimitBps,
        },
      },
    });

    throw new RiskCheckFailedError(
      'DAILY_LOSS_LIMIT',
      `This strategy has lost ~${lossBps.toDecimalPlaces(2)}bps in the last 24h, at or beyond its ${strategy.dailyLossLimitBps}bps limit.`,
    );
  }
}
