import { Injectable, Logger } from '@nestjs/common';
import { DataQualityFailureKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CandleRepository, StoredCandle } from './candle.repository';
import { TIMEFRAME_MS, Timeframe } from './ohlcv-provider.interface';

export interface QualityFailure {
  kind: DataQualityFailureKind;
  detail: string;
}

export interface QualityVerdict {
  passed: boolean;
  /** 0..1. Only meaningful when `passed`; a failed gate has no usable score. */
  score: number;
  failures: QualityFailure[];
  barsExamined: number;
}

export interface QualityPolicy {
  /** Bars the caller needs. Fewer than this is INSUFFICIENT_HISTORY, not a smaller window. */
  requiredBars: number;
  /** How many timeframe-widths the newest bar may lag `asOf` before it is stale. */
  maxStalenessMultiple: number;
  /** A single-bar return beyond this many sigma, unconfirmed, is an outlier. */
  outlierSigma: number;
  /** Fraction of bars in the window allowed to have zero volume. */
  maxZeroVolumeFraction: number;
}

export const DEFAULT_QUALITY_POLICY: QualityPolicy = {
  requiredBars: 200,
  maxStalenessMultiple: 2,
  outlierSigma: 10,
  maxZeroVolumeFraction: 0.05,
};

/**
 * The gate that stands between raw data and every feature computed from it (docs/17 §2.5).
 *
 * Its output is deliberately **binary at the top**: a failed gate does not produce a degraded
 * signal with a lower confidence, it produces no signal at all. The distinction matters because
 * a confidence number is something a model earned by being right in the past, and there is no
 * evidence at all about how a model performs on data that is missing, stale or corrupt.
 * Discounting confidence in that situation invents a number; refusing does not.
 *
 * Every refusal is written to an append-only table, because "why was there no signal at 14:00?"
 * has to have an answer. A gate that silently declines is indistinguishable from a gate that is
 * broken, and a system whose quiet periods cannot be explained is one nobody will trust when it
 * does finally speak.
 */
@Injectable()
export class DataQualityService {
  private readonly logger = new Logger(DataQualityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly candles: CandleRepository,
  ) {}

  async evaluate(params: {
    symbol: string;
    timeframe: Timeframe;
    asOf: Date;
    policy?: Partial<QualityPolicy>;
    /** Disagreements observed during the fetch that produced this data. */
    disagreements?: Array<{ provider: string; deviationBps: number }>;
    /** Set false in tests that only want the verdict. */
    record?: boolean;
  }): Promise<QualityVerdict> {
    const policy = { ...DEFAULT_QUALITY_POLICY, ...params.policy };

    const bars = await this.candles.knowableAt({
      symbol: params.symbol,
      timeframe: params.timeframe,
      asOf: params.asOf,
      limit: policy.requiredBars,
    });

    const failures: QualityFailure[] = [];

    if (bars.length === 0) {
      failures.push({
        kind: DataQualityFailureKind.NO_DATA,
        detail: `No ${params.timeframe} bars for ${params.symbol} knowable at ${params.asOf.toISOString()}.`,
      });
      return this.finish(params, failures, 0, 0);
    }

    if (bars.length < policy.requiredBars) {
      // Not a warning. A 200-EMA over 40 bars is not an approximation of a 200-EMA, it is a
      // different and wrong number, and it will look perfectly plausible on a chart.
      failures.push({
        kind: DataQualityFailureKind.INSUFFICIENT_HISTORY,
        detail: `${bars.length} bars available, ${policy.requiredBars} required.`,
      });
    }

    failures.push(...this.checkGaps(bars, params.timeframe));
    failures.push(...this.checkStaleness(bars, params.timeframe, params.asOf, policy));
    failures.push(...this.checkOutliers(bars, policy));
    failures.push(...this.checkVolume(bars, policy));

    for (const d of params.disagreements ?? []) {
      failures.push({
        kind: DataQualityFailureKind.PROVIDER_DISAGREEMENT,
        detail: `${d.provider} differs from the primary by ${d.deviationBps} bps.`,
      });
    }

    return this.finish(params, failures, this.scoreFrom(failures), bars.length);
  }

  /**
   * Missing intervals inside the window.
   *
   * A gap is worse than an outage because it is invisible: the series still looks continuous,
   * every indicator still returns a number, and the number is computed over a window that
   * silently spans more wall-clock time than it claims to.
   */
  private checkGaps(bars: StoredCandle[], timeframe: Timeframe): QualityFailure[] {
    const span = TIMEFRAME_MS[timeframe];
    const gaps: string[] = [];

    for (let i = 1; i < bars.length; i++) {
      const delta = bars[i].openTime.getTime() - bars[i - 1].openTime.getTime();
      if (delta !== span) {
        const missing = Math.round(delta / span) - 1;
        gaps.push(`${missing} bar(s) after ${bars[i - 1].openTime.toISOString()}`);
      }
    }

    if (gaps.length === 0) return [];
    return [
      {
        kind: DataQualityFailureKind.MISSING_CANDLES,
        detail: `${gaps.length} gap(s): ${gaps.slice(0, 3).join('; ')}${gaps.length > 3 ? ' …' : ''}`,
      },
    ];
  }

  /**
   * Staleness, judged against the newest bar's own close time.
   *
   * A dead feed answers instantly with yesterday's number — the same failure mode `MarkRegistry`
   * already guards NAV against, and the same reasoning applies here: an old price is not a
   * slightly worse price, it is a claim about a market that has since moved.
   */
  private checkStaleness(
    bars: StoredCandle[],
    timeframe: Timeframe,
    asOf: Date,
    policy: QualityPolicy,
  ): QualityFailure[] {
    const newest = bars[bars.length - 1];
    const lagMs = asOf.getTime() - newest.closeTime.getTime();
    const allowed = TIMEFRAME_MS[timeframe] * policy.maxStalenessMultiple;

    if (lagMs <= allowed) return [];
    return [
      {
        kind: DataQualityFailureKind.STALE,
        detail:
          `Newest ${timeframe} bar closed ${Math.round(lagMs / 1000)}s before the evaluation ` +
          `instant; the limit is ${Math.round(allowed / 1000)}s.`,
      },
    ];
  }

  /**
   * Single-bar moves far outside the window's own distribution.
   *
   * Measured in units of the window's own return dispersion rather than as a fixed percentage,
   * because a 5% bar is unremarkable in a crisis and impossible in a quiet market — a fixed
   * threshold fires constantly in the first case and never in the second, which is exactly
   * backwards.
   *
   * **Median and MAD, not mean and standard deviation.** The obvious implementation uses the
   * standard deviation and it does not work, for a reason worth spelling out: an outlier is
   * included in the estimate meant to detect it, and it inflates that estimate enough to hide
   * itself. Concretely — a bad print produces *two* extreme returns, one into the spike and one
   * back out. With ~60 bars those two dominate the variance, and the z-score of each saturates
   * near `sqrt(n/2) / 1` regardless of how large the spike was; a 20% jump in an otherwise flat
   * series scored 5.4σ against a 10σ threshold and passed. Caught by a test built from exactly
   * that series.
   *
   * The median absolute deviation has a breakdown point of 50%, so a couple of extreme points
   * cannot move it at all. Scaled by 1.4826 it estimates the same quantity as σ for normally
   * distributed data, which keeps the threshold's usual interpretation. This is the Hampel
   * identifier, and it is the standard tool for the job.
   */
  private checkOutliers(bars: StoredCandle[], policy: QualityPolicy): QualityFailure[] {
    if (bars.length < 30) return [];

    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const prev = Number(bars[i - 1].close);
      const curr = Number(bars[i].close);
      if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
    }
    if (returns.length < 20) return [];

    const median = quantile(returns, 0.5);
    const mad = quantile(
      returns.map((r) => Math.abs(r - median)),
      0.5,
    );

    // A MAD of zero means over half the bars had an identical return — a frozen or synthetic
    // series. There is no dispersion to measure against, and dividing by it would report every
    // bar as infinitely anomalous.
    if (mad === 0) return [];
    const scale = mad * 1.4826;

    const worst = returns.reduce(
      (acc, r, i) => {
        const z = Math.abs(r - median) / scale;
        return z > acc.z ? { z, index: i + 1 } : acc;
      },
      { z: 0, index: -1 },
    );

    if (worst.z <= policy.outlierSigma) return [];
    return [
      {
        kind: DataQualityFailureKind.PRICE_OUTLIER,
        detail:
          `A ${worst.z.toFixed(1)}σ (robust) single-bar move at ` +
          `${bars[worst.index].openTime.toISOString()} exceeds the ${policy.outlierSigma}σ limit.`,
      },
    ];
  }

  /** Zero-volume bars mean the venue printed a candle nobody traded in. */
  private checkVolume(bars: StoredCandle[], policy: QualityPolicy): QualityFailure[] {
    const zeros = bars.filter((b) => b.volume.isZero()).length;
    const fraction = zeros / bars.length;
    if (fraction <= policy.maxZeroVolumeFraction) return [];
    return [
      {
        kind: DataQualityFailureKind.ZERO_VOLUME,
        detail: `${zeros}/${bars.length} bars (${(fraction * 100).toFixed(1)}%) have zero volume.`,
      },
    ];
  }

  /**
   * A score, for the record — but note it never rescues a failure.
   *
   * The gate is `failures.length === 0`, full stop. The score exists so the signal record can
   * report *how* clean clean was, not so that a nearly-good-enough window can be waved through
   * at reduced confidence.
   */
  private scoreFrom(failures: QualityFailure[]): number {
    return failures.length === 0 ? 1 : 0;
  }

  private async finish(
    params: { symbol: string; timeframe: Timeframe; asOf: Date; record?: boolean },
    failures: QualityFailure[],
    score: number,
    barsExamined: number,
  ): Promise<QualityVerdict> {
    const passed = failures.length === 0;

    if (!passed && params.record !== false) {
      await this.prisma.dataQualityFailure.createMany({
        data: failures.map((f) => ({
          symbol: params.symbol,
          timeframe: params.timeframe,
          kind: f.kind,
          detail: f.detail,
          asOf: params.asOf,
        })),
      });
      this.logger.warn(
        `Data quality gate refused ${params.symbol} ${params.timeframe}: ` +
          failures.map((f) => f.kind).join(', '),
      );
    }

    return { passed, score, failures, barsExamined };
  }

  /** Recent refusals, for the operator surface answering "why was it quiet?". */
  async recentFailures(limit = 100) {
    return this.prisma.dataQualityFailure.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}

export type { Prisma };

/** Linear-interpolated quantile over an unsorted sample. Copies before sorting. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}
