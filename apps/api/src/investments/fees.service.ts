import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  AuditActorType,
  FeeAccrualKind,
  InvestmentPosition,
  InvestmentStrategy,
  LedgerAccountType,
  LedgerTransactionType,
  NotificationType,
  Prisma,
  StrategyStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { HighPrecision, exactDiff, exactNeg, exactSum, formatAmount, quantize } from '../ledger/amount.util';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { NavService } from '../nav/nav.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { adjustTotalUnits } from './units.util';

const BPS_DIVISOR = new HighPrecision(10_000);
const DAYS_PER_YEAR = new HighPrecision(365);
const MS_PER_DAY = new HighPrecision(86_400_000);

/**
 * Amounts leave this service as strings, never as `Prisma.Decimal` or `number`.
 *
 * A `Decimal` serialises to `{"d":[10000],"e":4,"s":1}` — its internal coefficient array — which
 * a client cannot read and which no amount of downstream care recovers. A `number` is worse: an
 * 18-decimal value does not fit a float64, so JSON serialisation would silently round somebody's
 * fee. See `formatAmount`.
 */
export interface PositionAccrual {
  positionId: string;
  userId: string;
  /** Change in the accrued management fee over this period. Never negative — time only runs forward. */
  managementDelta: string;
  /** Change in the accrued performance fee. **May be negative** when NAV has fallen back. */
  performanceDelta: string;
  accruedMgmtFee: string;
  accruedPerfFee: string;
}

export interface AccrualRun {
  snapshotId: string;
  navPerUnit: string;
  asOf: string;
  positions: PositionAccrual[];
  totalAccrued: string;
}

export interface PositionCrystallisation {
  positionId: string;
  userId: string;
  amount: string;
  unitsCancelled: string;
  hwmBefore: string;
  hwmAfter: string;
  transactionId: string;
}

export interface CrystallisationRun {
  snapshotId: string;
  navPerUnit: string;
  charged: PositionCrystallisation[];
  skipped: Array<{ positionId: string; reason: string }>;
  totalCharged: string;
}

/**
 * The fee engine (docs/12 §6) — the High Water Mark and the two accruals that sit on top of it.
 *
 * The platform's model is a **pure profit share: 50% of new profit to the manager, 50% to the
 * investor**, with no management fee at all when there is no profit (`perfFeeBps = 5000`,
 * `mgmtFeeBps = 0`). At that rate the HWM stops being a nicety: charging on recovered losses
 * would take half of a gain the investor has already paid for once. Everything below is shaped
 * by that.
 *
 * Four properties, each of which is a decision rather than an implementation detail:
 *
 *   1. **Performance fee is marked to market, not summed.** Each run recomputes the *target*
 *      liability — `max(0, navPerUnit − hwm) × units × rate` — and records the **delta** from
 *      what was already accrued. Adding a fresh charge every run would bill an investor twice
 *      for one gain simply because the job ran twice. The delta can be negative: when NAV falls
 *      back, the un-earned accrual is released, as a new row rather than an edit, because
 *      `fee_accruals` is append-only.
 *
 *   2. **Accruals are not ledger postings.** An accrual moves nothing; it is a liability
 *      estimate. Posting it would pull every *other* investor's `navPerUnit` down for a fee
 *      they do not owe (docs/12 §1.1). Only crystallisation touches the ledger.
 *
 *   3. **Crystallisation is paid in units, not in someone else's money.** The paying investor's
 *      units are cancelled and the equivalent cash leaves the pool, which leaves `navPerUnit`
 *      *exactly* unchanged for everyone else:
 *
 *          (N − f) / (U − f·U/N)  =  (N − f) / (U(N − f)/N)  =  N/U
 *
 *      A fee that moved the unit price would make one investor's bill everybody's loss.
 *
 *   4. **The HWM ratchets only when the fee is actually paid.** If the pool cannot fund the
 *      charge the position is skipped and its HWM stays where it was — ratcheting it would mean
 *      the investor forfeited the protection without the platform ever collecting.
 *
 * Every accrual writes an immutable row carrying period, rate, base, HWM and result, so an
 * investor can recompute any charge themselves. A fee that has to be taken on trust is not one
 * this platform asks for.
 */
@Injectable()
export class FeesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FeesService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly nav: NavService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.feeAccrualEnabled) {
      this.logger.log('Scheduled fee accrual disabled by configuration.');
      return;
    }
    const interval = this.config.feeAccrualIntervalMs;
    this.timer = setInterval(() => void this.accrueAll(), interval);
    this.timer.unref?.();
    this.logger.log(`Fee accrual started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Accrual ─────────────────────────────────────────────────────────────

  /**
   * Brings every position in a strategy up to date, against a freshly struck valuation.
   *
   * The snapshot is struck here rather than read from the last one on purpose: a fee computed
   * against a stale NAV is a fee computed against a price nobody can point to. Striking it also
   * means the accrual inherits the NAV engine's refusals — if a holding cannot be priced, no
   * fee is accrued at all, rather than one being accrued against a guess.
   */
  async accrue(strategyId: string, asOf: Date = new Date()): Promise<AccrualRun> {
    const strategy = await this.prisma.investmentStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    const snapshot = await this.nav.strikeSnapshot(strategyId, false);
    const positions = await this.accrueAtPrice(strategy, snapshot.navPerUnit, asOf);

    const total = exactSum(
      ...positions.flatMap((p) => [p.managementDelta, p.performanceDelta]),
    );

    return {
      snapshotId: snapshot.id,
      navPerUnit: formatAmount(snapshot.navPerUnit),
      asOf: asOf.toISOString(),
      positions,
      totalAccrued: formatAmount(total),
    };
  }

  /**
   * Accrues every position against a price that has *already* been struck.
   *
   * This is the entry point a dealing point uses. An investor redeeming must be charged at the
   * same unit price they are redeeming at — striking a second valuation a moment later would
   * price the fee and the redemption off two different numbers, and any gap between them lands
   * on whichever side the caller happened to compute first.
   */
  async accrueAtPrice(
    strategy: InvestmentStrategy,
    navPerUnit: Prisma.Decimal,
    asOf: Date = new Date(),
  ): Promise<PositionAccrual[]> {
    const positions = await this.prisma.investmentPosition.findMany({
      where: { strategyId: strategy.id },
      orderBy: { createdAt: 'asc' },
    });

    const results: PositionAccrual[] = [];
    for (const position of positions) {
      results.push(await this.accruePosition(strategy, position, navPerUnit, asOf));
    }
    return results;
  }

  /**
   * One position's accrual for the window `[lastAccruedAt ?? createdAt, asOf]`.
   *
   * The window is stored rather than assumed to be "one day". A job that runs twice in a day
   * must charge for one day, and a job that misses a day must still charge for it when it next
   * runs; deriving the period from "now minus the schedule interval" does neither, and both
   * failure modes are silent.
   */
  private async accruePosition(
    strategy: InvestmentStrategy,
    position: InvestmentPosition,
    navPerUnit: Prisma.Decimal,
    asOf: Date,
  ): Promise<PositionAccrual> {
    const periodStart = position.lastAccruedAt ?? position.createdAt;

    // Clock skew, a replayed run, or a manually-passed `asOf` in the past. Charging for a
    // negative period would credit the investor a fee they never paid; refusing to move is the
    // only safe response.
    if (asOf <= periodStart) {
      return {
        positionId: position.id,
        userId: position.userId,
        managementDelta: '0',
        performanceDelta: '0',
        accruedMgmtFee: formatAmount(position.accruedMgmtFee),
        accruedPerfFee: formatAmount(position.accruedPerfFee),
      };
    }

    const units = new HighPrecision(position.units.toString());
    const price = new HighPrecision(navPerUnit.toString());
    const positionValue = units.times(price);

    // ── Management fee: time × value × rate. Additive, because time only runs forward. ──
    let managementDelta = new Prisma.Decimal(0);
    if (strategy.mgmtFeeBps > 0 && positionValue.greaterThan(0)) {
      const days = new HighPrecision(asOf.getTime() - periodStart.getTime()).dividedBy(MS_PER_DAY);
      managementDelta = quantize(
        new Prisma.Decimal(
          positionValue
            .times(new HighPrecision(strategy.mgmtFeeBps))
            .dividedBy(BPS_DIVISOR)
            .dividedBy(DAYS_PER_YEAR)
            .times(days)
            .toFixed(30),
        ),
      );
    }

    // ── Performance fee: a mark-to-market of the whole liability, then the delta. ──
    //
    // `max(0, …)` is the high water mark doing its job. Below the HWM the target is zero, so
    // the delta releases whatever was accrued on a gain that has since evaporated — and a
    // recovery back to a level already paid for accrues nothing, because the target at that
    // price is the same number the investor was charged last time.
    const hwm = new HighPrecision(position.hwmUnitPrice.toString());
    const gainPerUnit = price.minus(hwm);
    const perfTarget =
      strategy.perfFeeBps > 0 && gainPerUnit.greaterThan(0) && units.greaterThan(0)
        ? quantize(
            new Prisma.Decimal(
              gainPerUnit
                .times(units)
                .times(new HighPrecision(strategy.perfFeeBps))
                .dividedBy(BPS_DIVISOR)
                .toFixed(30),
            ),
          )
        : new Prisma.Decimal(0);

    const performanceDelta = exactDiff(perfTarget, position.accruedPerfFee);

    const accruedMgmtFee = exactSum(position.accruedMgmtFee, managementDelta);
    const accruedPerfFee = perfTarget;

    const rows: Prisma.FeeAccrualCreateManyInput[] = [];
    if (!managementDelta.isZero()) {
      rows.push({
        positionId: position.id,
        kind: FeeAccrualKind.MANAGEMENT,
        periodStart,
        periodEnd: asOf,
        rateBps: strategy.mgmtFeeBps,
        baseAmount: new Prisma.Decimal(positionValue.toFixed(18)),
        navPerUnit,
        amount: managementDelta,
      });
    }
    if (!performanceDelta.isZero()) {
      rows.push({
        positionId: position.id,
        kind: FeeAccrualKind.PERFORMANCE,
        periodStart,
        periodEnd: asOf,
        rateBps: strategy.perfFeeBps,
        baseAmount: new Prisma.Decimal(positionValue.toFixed(18)),
        hwmUnitPrice: position.hwmUnitPrice,
        navPerUnit,
        amount: performanceDelta,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (rows.length > 0) {
        await tx.feeAccrual.createMany({ data: rows });
      }
      await tx.investmentPosition.update({
        where: { id: position.id },
        data: { accruedMgmtFee, accruedPerfFee, lastAccruedAt: asOf },
      });
    });

    return {
      positionId: position.id,
      userId: position.userId,
      managementDelta: formatAmount(managementDelta),
      performanceDelta: formatAmount(performanceDelta),
      accruedMgmtFee: formatAmount(accruedMgmtFee),
      accruedPerfFee: formatAmount(accruedPerfFee),
    };
  }

  /**
   * Accrues across every live strategy. One strategy that cannot be valued must not stop the
   * others — and the failure has to be loud, because an accrual silently not happening is a fee
   * the platform will later try to charge for a period it has no record of.
   */
  async accrueAll(): Promise<{ accrued: number; failed: number }> {
    if (this.running) return { accrued: 0, failed: 0 };
    this.running = true;

    try {
      const strategies = await this.prisma.investmentStrategy.findMany({
        where: {
          status: {
            in: [
              StrategyStatus.OPEN,
              StrategyStatus.SOFT_CLOSED,
              StrategyStatus.PAUSED,
              StrategyStatus.WINDING_DOWN,
            ],
          },
        },
        select: { id: true, slug: true },
      });

      let accrued = 0;
      let failed = 0;
      for (const strategy of strategies) {
        try {
          await this.accrue(strategy.id);
          accrued++;
        } catch (err) {
          failed++;
          this.logger.error(
            `Fee accrual failed for "${strategy.slug}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return { accrued, failed };
    } finally {
      this.running = false;
    }
  }

  // ── Crystallisation ─────────────────────────────────────────────────────

  /**
   * Settles what has accrued: units cancelled, cash out of the pool into platform revenue, HWM
   * ratcheted to the price the fee was measured at.
   *
   * Accrues first, so the charge is against the current valuation rather than whenever the job
   * last ran. A position the pool cannot fund is skipped, not part-paid: a partial charge with
   * a full HWM ratchet would quietly forfeit the investor's protection.
   */
  async crystallise(strategyId: string, actorId: string): Promise<CrystallisationRun> {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id: strategyId },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    const run = await this.accrue(strategyId);
    const snapshot = await this.prisma.navSnapshot.findUniqueOrThrow({ where: { id: run.snapshotId } });
    const navPerUnit = snapshot.navPerUnit;

    if (navPerUnit.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        code: 'UNPRICEABLE_POOL',
        message: 'Pool NAV is zero or negative; fees cannot be crystallised at an unusable unit price.',
      });
    }

    const positions = await this.prisma.investmentPosition.findMany({
      where: { strategyId },
      orderBy: { createdAt: 'asc' },
    });

    const charged: PositionCrystallisation[] = [];
    const skipped: Array<{ positionId: string; reason: string }> = [];
    let totalCharged = new Prisma.Decimal(0);

    for (const position of positions) {
      const fee = exactSum(position.accruedMgmtFee, position.accruedPerfFee);
      if (fee.lessThanOrEqualTo(0)) continue;

      const unitsCancelled = quantize(
        new Prisma.Decimal(
          new HighPrecision(fee.toString())
            .dividedBy(new HighPrecision(navPerUnit.toString()))
            .toFixed(30),
        ),
      );

      if (unitsCancelled.greaterThan(position.units)) {
        // Only reachable if the accrual and the position have drifted apart — a fee larger than
        // the position it is charged on is not a fee, it is a bug, and charging it would take
        // value from the other holders.
        skipped.push({
          positionId: position.id,
          reason: `Fee of ${formatAmount(fee)} exceeds the position's ${formatAmount(position.units)} units.`,
        });
        continue;
      }

      const poolCash = await this.poolCash(strategyId, strategy.baseAssetId);
      if (poolCash.lessThan(fee)) {
        skipped.push({
          positionId: position.id,
          reason: `Pool holds ${formatAmount(poolCash)} ${strategy.baseAsset.symbol}; the charge needs ${formatAmount(fee)}.`,
        });
        this.logger.warn(
          `Fee crystallisation skipped for position ${position.id}: pool cash ${formatAmount(poolCash)} < fee ${formatAmount(fee)}.`,
        );
        continue;
      }

      const posted = await this.ledger.post({
        type: LedgerTransactionType.FEE_CRYSTALLISATION,
        idempotencyKey: `fee-crystallise:${position.id}:${snapshot.id}`,
        referenceType: 'InvestmentPosition',
        referenceId: position.id,
        metadata: {
          strategy: strategy.slug,
          navPerUnit: formatAmount(navPerUnit),
          managementFee: formatAmount(position.accruedMgmtFee),
          performanceFee: formatAmount(position.accruedPerfFee),
          hwmBefore: formatAmount(position.hwmUnitPrice),
          unitsCancelled: formatAmount(unitsCancelled),
          snapshotId: snapshot.id,
        },
        legs: [
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId,
            amount: exactNeg(fee),
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: strategy.baseAssetId,
            type: LedgerAccountType.PLATFORM_REVENUE,
            amount: fee,
          },
        ],
      });

      const hwmAfter = navPerUnit.greaterThan(position.hwmUnitPrice) ? navPerUnit : position.hwmUnitPrice;

      await this.prisma.$transaction(async (tx) => {
        await tx.investmentPosition.update({
          where: { id: position.id },
          data: {
            units: exactDiff(position.units, unitsCancelled),
            hwmUnitPrice: hwmAfter,
            accruedMgmtFee: new Prisma.Decimal(0),
            accruedPerfFee: new Prisma.Decimal(0),
          },
        });
        await adjustTotalUnits(tx, strategyId, exactNeg(unitsCancelled));
        await tx.feeAccrual.updateMany({
          where: { positionId: position.id, crystallisedAt: null },
          data: { crystallisedAt: new Date(), crystallisedTransactionId: posted.id },
        });
      });

      await this.notifications.notify({
        userId: position.userId,
        type: NotificationType.INVESTMENT,
        title: 'Performance fee charged',
        body:
          `${formatAmount(fee)} ${strategy.baseAsset.symbol} was charged on ${strategy.name} at ` +
          `${formatAmount(navPerUnit)} per unit (${formatAmount(unitsCancelled)} units cancelled). ` +
          `Your high water mark is now ${formatAmount(hwmAfter)} — no further performance fee applies ` +
          `until the unit price goes above it.`,
      });

      charged.push({
        positionId: position.id,
        userId: position.userId,
        amount: formatAmount(fee),
        unitsCancelled: formatAmount(unitsCancelled),
        hwmBefore: formatAmount(position.hwmUnitPrice),
        hwmAfter: formatAmount(hwmAfter),
        transactionId: posted.id,
      });
      totalCharged = exactSum(totalCharged, fee);
    }

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId,
      action: 'investment.fees_crystallised',
      entityType: 'InvestmentStrategy',
      entityId: strategyId,
      metadata: {
        strategy: strategy.slug,
        navPerUnit: formatAmount(navPerUnit),
        snapshotId: snapshot.id,
        positionsCharged: charged.length,
        positionsSkipped: skipped.length,
        totalCharged: formatAmount(totalCharged),
      },
    });

    return {
      snapshotId: snapshot.id,
      navPerUnit: formatAmount(navPerUnit),
      charged,
      skipped,
      totalCharged: formatAmount(totalCharged),
    };
  }

  /**
   * The fee owed on a redemption: the accrued liability, pro rata to the units being cancelled.
   *
   * Called by the dealing engine inside a dealing point, which is why it takes the already-struck
   * `navPerUnit` rather than striking its own — the investor must be charged at the same price
   * they are redeeming at.
   *
   * Pro rata rather than in full: an investor redeeming half their units has earned half the
   * accrued fee so far, and charging the whole of it would bill them early for the half they
   * keep. The remainder stays accrued against the units that remain, along with their HWM.
   *
   * Unlike a standalone crystallisation this cancels **no extra units** — the fee is carved out
   * of the redemption proceeds. The pool pays out gross either way, so `navPerUnit` is again
   * untouched for the holders who stay.
   */
  async settleRedemptionFee(params: {
    positionId: string;
    strategy: { id: string; slug: string; baseAssetId: string };
    unitsRedeemed: Prisma.Decimal;
    navPerUnit: Prisma.Decimal;
    redemptionId: string;
  }): Promise<{ fee: Prisma.Decimal; transactionId: string | null }> {
    const position = await this.prisma.investmentPosition.findUniqueOrThrow({
      where: { id: params.positionId },
    });

    const accrued = exactSum(position.accruedMgmtFee, position.accruedPerfFee);
    if (accrued.lessThanOrEqualTo(0) || position.units.lessThanOrEqualTo(0)) {
      return { fee: new Prisma.Decimal(0), transactionId: null };
    }

    const fraction = params.unitsRedeemed.greaterThanOrEqualTo(position.units)
      ? new HighPrecision(1)
      : new HighPrecision(params.unitsRedeemed.toString()).dividedBy(
          new HighPrecision(position.units.toString()),
        );

    const fee = quantize(
      new Prisma.Decimal(new HighPrecision(accrued.toString()).times(fraction).toFixed(30)),
    );
    if (fee.lessThanOrEqualTo(0)) {
      return { fee: new Prisma.Decimal(0), transactionId: null };
    }

    // Split the charge back across the two accrual buckets in the same proportion, so the
    // remaining balances still describe what they are named for.
    const mgmtCharged = quantize(
      new Prisma.Decimal(
        new HighPrecision(position.accruedMgmtFee.toString()).times(fraction).toFixed(30),
      ),
    );
    const perfCharged = exactDiff(fee, mgmtCharged);

    const posted = await this.ledger.post({
      type: LedgerTransactionType.FEE_CRYSTALLISATION,
      idempotencyKey: `fee-redemption:${params.redemptionId}`,
      referenceType: 'RedemptionRequest',
      referenceId: params.redemptionId,
      metadata: {
        strategy: params.strategy.slug,
        navPerUnit: formatAmount(params.navPerUnit),
        managementFee: formatAmount(mgmtCharged),
        performanceFee: formatAmount(perfCharged),
        unitsRedeemed: formatAmount(params.unitsRedeemed),
      },
      legs: [
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId: params.strategy.baseAssetId,
          type: LedgerAccountType.STRATEGY_POOL,
          strategyId: params.strategy.id,
          amount: exactNeg(fee),
        },
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId: params.strategy.baseAssetId,
          type: LedgerAccountType.PLATFORM_REVENUE,
          amount: fee,
        },
      ],
    });

    // A replay means this redemption's fee was already taken and the accrued balances already
    // reduced. Reducing them again would charge the investor twice for one settlement.
    if (posted.replayed) {
      return { fee, transactionId: posted.id };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.investmentPosition.update({
        where: { id: position.id },
        data: {
          accruedMgmtFee: exactDiff(position.accruedMgmtFee, mgmtCharged),
          accruedPerfFee: exactDiff(position.accruedPerfFee, perfCharged),
        },
      });
      // A full redemption settles the position's whole accrual history; a partial one leaves the
      // outstanding rows open against the units that remain.
      if (fraction.equals(1)) {
        await tx.feeAccrual.updateMany({
          where: { positionId: position.id, crystallisedAt: null },
          data: { crystallisedAt: new Date(), crystallisedTransactionId: posted.id },
        });
      }
    });

    return { fee, transactionId: posted.id };
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  /**
   * The audit trail behind an investor's charges: every accrual with its period, rate, base,
   * high water mark and result, so the arithmetic can be recomputed rather than trusted.
   */
  async feeHistory(userId: string, strategyId: string) {
    const position = await this.prisma.investmentPosition.findUnique({
      where: { userId_strategyId: { userId, strategyId } },
      include: { strategy: { include: { baseAsset: true } } },
    });
    if (!position) {
      throw new NotFoundException({ code: 'POSITION_NOT_FOUND', message: 'No position in this strategy.' });
    }

    const accruals = await this.prisma.feeAccrual.findMany({
      where: { positionId: position.id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return {
      strategy: { slug: position.strategy.slug, name: position.strategy.name },
      asset: position.strategy.baseAsset.symbol,
      terms: {
        managementFeeBps: position.strategy.mgmtFeeBps,
        performanceFeeBps: position.strategy.perfFeeBps,
        /// Spelled out because a bps figure is not what an investor reasons about.
        description:
          `${position.strategy.perfFeeBps / 100}% of profit above your high water mark` +
          (position.strategy.mgmtFeeBps > 0
            ? `, plus ${position.strategy.mgmtFeeBps / 100}% a year on the value held.`
            : ', and nothing when there is no profit.'),
      },
      highWaterMark: formatAmount(position.hwmUnitPrice),
      accrued: {
        management: formatAmount(position.accruedMgmtFee),
        performance: formatAmount(position.accruedPerfFee),
        total: formatAmount(exactSum(position.accruedMgmtFee, position.accruedPerfFee)),
      },
      lastAccruedAt: position.lastAccruedAt?.toISOString() ?? null,
      accruals: accruals.map((a) => ({
        id: a.id,
        kind: a.kind,
        periodStart: a.periodStart.toISOString(),
        periodEnd: a.periodEnd.toISOString(),
        rateBps: a.rateBps,
        baseAmount: formatAmount(a.baseAmount),
        hwmUnitPrice: a.hwmUnitPrice ? formatAmount(a.hwmUnitPrice) : null,
        navPerUnit: a.navPerUnit ? formatAmount(a.navPerUnit) : null,
        amount: formatAmount(a.amount),
        /// Negative amounts are releases, not charges: a gain that has since evaporated is not
        /// one the investor owes on, and the reversal is recorded rather than edited away.
        isRelease: a.amount.isNegative(),
        crystallisedAt: a.crystallisedAt?.toISOString() ?? null,
      })),
    };
  }

  private async poolCash(strategyId: string, assetId: string): Promise<Prisma.Decimal> {
    const balance = await this.prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return balance?.amount ?? new Prisma.Decimal(0);
  }
}
