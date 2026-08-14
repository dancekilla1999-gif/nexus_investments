import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LedgerAccountType, Prisma, StrategyStatus } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { formatAmount } from '../ledger/amount.util';
import { PrismaService } from '../prisma/prisma.service';
import { MarkRegistry } from './mark.registry';

/** The scale NAV arithmetic works at, matching the storage column. */
const STORED_DP = 18;

/**
 * Intermediates multiply a holding by a price before dividing by units — three operations where
 * Decimal.js's default 20 significant digits truncates silently. This has already produced real
 * bugs in this codebase twice; see CLAUDE.md §2 rule 10.
 */
const HighPrecision = Prisma.Decimal.clone({ precision: 60 });

export interface MarkRecord {
  assetSymbol: string;
  quantity: string;
  price: string;
  value: string;
  source: string;
  asOf: string;
}

export interface Valuation {
  poolNav: Prisma.Decimal;
  cashComponent: Prisma.Decimal;
  positionComponent: Prisma.Decimal;
  marks: MarkRecord[];
  /** Summary of where prices came from, stored on the snapshot. */
  markSource: string;
}

/**
 * The NAV Engine (docs/12 §5).
 *
 * Two properties define it, and both are about who is allowed to influence the number:
 *
 *   1. **`navPerUnit` is written here and nowhere else.** There is no endpoint, admin action or
 *      service method anywhere that sets it. It is not even a column on `investment_strategies`
 *      — it lives only on an append-only snapshot, so there is no field to hand-edit.
 *   2. **Prices are sourced, never supplied.** Every mark carries a provider and an observation
 *      time, both recorded on the snapshot. A manager who can set prices can author their own
 *      performance fee, so the code has no parameter through which one could be passed.
 *
 * When a holding cannot be priced, or its price is stale, valuation **fails**. It does not fall
 * back to zero, to the last known value, or to cost. Each of those understates or misstates NAV
 * in a way that benefits someone, and a NAV nobody can trust is worse than an error.
 */
@Injectable()
export class NavService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NavService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marks: MarkRegistry,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.navRevaluationEnabled) {
      this.logger.log('Scheduled NAV revaluation disabled by configuration.');
      return;
    }
    const interval = this.config.navRevaluationIntervalMs;
    this.timer = setInterval(() => void this.revalueAll(), interval);
    this.timer.unref?.();
    this.logger.log(`NAV revaluation started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Valuation ───────────────────────────────────────────────────────────

  /**
   * Values a pool from what it actually holds, at sourced prices.
   *
   * Throws `NoMarkError` or `StaleMarkError` rather than skipping a holding. A partial NAV is
   * not a smaller NAV — it is a wrong one, and it is wrong in the direction that reduces every
   * investor's stated stake.
   */
  async valuePool(strategyId: string): Promise<Valuation> {
    const strategy = await this.prisma.investmentStrategy.findUniqueOrThrow({
      where: { id: strategyId },
      include: { baseAsset: true },
    });

    const holdings = await this.prisma.balance.findMany({
      where: { type: LedgerAccountType.STRATEGY_POOL, ledgerAccount: { strategyId } },
      include: { asset: true },
      orderBy: { assetId: 'asc' },
    });

    let cash = new HighPrecision(0);
    let positions = new HighPrecision(0);
    const marks: MarkRecord[] = [];
    const sources = new Set<string>();

    for (const holding of holdings) {
      // A zero balance needs no price. Demanding one would make an unrelated dead feed block a
      // valuation that does not depend on it.
      if (holding.amount.isZero()) continue;

      const mark = await this.marks.requireMark(holding.assetId, strategy.baseAssetId);
      const quantity = new HighPrecision(holding.amount.toString());
      const price = new HighPrecision(mark.price.toString());
      const value = quantity.times(price);

      if (holding.assetId === strategy.baseAssetId) {
        cash = cash.plus(value);
      } else {
        positions = positions.plus(value);
      }

      sources.add(mark.source);
      marks.push({
        assetSymbol: holding.asset.symbol,
        quantity: formatAmount(holding.amount),
        price: formatAmount(new Prisma.Decimal(price.toString())),
        value: formatAmount(new Prisma.Decimal(value.toFixed(STORED_DP))),
        source: mark.source,
        asOf: mark.asOf.toISOString(),
      });
    }

    const poolNav = cash.plus(positions);

    return {
      poolNav: new Prisma.Decimal(poolNav.toFixed(STORED_DP)),
      cashComponent: new Prisma.Decimal(cash.toFixed(STORED_DP)),
      positionComponent: new Prisma.Decimal(positions.toFixed(STORED_DP)),
      marks,
      markSource: sources.size === 0 ? 'empty-pool' : [...sources].sort().join('+'),
    };
  }

  // ── Snapshots ───────────────────────────────────────────────────────────

  /**
   * Strikes and records a valuation.
   *
   * `isDealingPoint` distinguishes a scheduled mark-to-market from one that money settles at.
   * Both are immutable; only the latter can issue or cancel units.
   */
  async strikeSnapshot(strategyId: string, isDealingPoint: boolean) {
    const strategy = await this.prisma.investmentStrategy.findUniqueOrThrow({
      where: { id: strategyId },
    });
    const valuation = await this.valuePool(strategyId);

    const navPerUnit = strategy.totalUnits.isZero()
      ? new Prisma.Decimal(1)
      : new Prisma.Decimal(
          new HighPrecision(valuation.poolNav.toString())
            .dividedBy(new HighPrecision(strategy.totalUnits.toString()))
            .toFixed(STORED_DP),
        );

    return this.prisma.navSnapshot.create({
      data: {
        strategyId,
        poolNav: valuation.poolNav,
        totalUnits: strategy.totalUnits,
        navPerUnit,
        cashComponent: valuation.cashComponent,
        positionComponent: valuation.positionComponent,
        markSource: valuation.markSource,
        isDealingPoint,
        marks: valuation.marks as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** The most recent valuation, dealing point or not. */
  async latestSnapshot(strategyId: string) {
    return this.prisma.navSnapshot.findFirst({
      where: { strategyId },
      orderBy: { struckAt: 'desc' },
    });
  }

  // ── Scheduled revaluation ───────────────────────────────────────────────

  /**
   * Marks every live strategy to market. These snapshots do not settle anything — they exist so
   * an investor's displayed value tracks reality between dealing points, and so a drawdown
   * breach is noticed when it happens rather than at the next deal.
   */
  async revalueAll(): Promise<{ valued: number; failed: number }> {
    if (this.running) return { valued: 0, failed: 0 };
    this.running = true;

    try {
      const strategies = await this.prisma.investmentStrategy.findMany({
        where: {
          status: {
            in: [StrategyStatus.OPEN, StrategyStatus.SOFT_CLOSED, StrategyStatus.PAUSED, StrategyStatus.WINDING_DOWN],
          },
        },
        select: { id: true, slug: true },
      });

      let valued = 0;
      let failed = 0;

      for (const strategy of strategies) {
        try {
          await this.strikeSnapshot(strategy.id, false);
          valued++;
        } catch (err) {
          // One unpriceable strategy must not stop the others being valued, and the failure has
          // to be loud: a strategy silently stuck on an old NAV is showing investors a number
          // that is no longer true.
          failed++;
          this.logger.error(
            `NAV revaluation failed for "${strategy.slug}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return { valued, failed };
    } finally {
      this.running = false;
    }
  }
}
