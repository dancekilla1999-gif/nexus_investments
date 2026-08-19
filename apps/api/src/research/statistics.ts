import { mean, quantile, sampleStd } from '../features/kernels/series';

/**
 * The statistics that decide whether a backtest result means anything (docs/18 §3.3, §4.4).
 *
 * The theme: a good-looking number is not evidence. Most of what follows exists to answer
 * "how likely is this by chance, given how hard we looked?" — the question that separates a real
 * edge from the best of four hundred attempts.
 */

export interface PerformanceMetrics {
  trades: number;
  totalR: number;
  meanR: number;
  medianR: number;
  winRate: number;
  /** Gross wins over gross losses. Below 1 loses money regardless of win rate. */
  profitFactor: number | null;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  /** Average win over average loss. A 70% win rate at 0.3 payoff loses money. */
  payoffRatio: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownR: number;
  calmar: number | null;
  /** Mean R excluding the five best trades — how much of the edge is one lucky stretch. */
  meanRExcludingBest5: number;
  /** Bootstrap 95% interval on mean R. */
  meanRCi95: [number, number];
}

/**
 * Every metric, computed together and reported together.
 *
 * Win rate is never returned alone and never displayed alone. A 70% win rate with a 0.3 payoff
 * ratio loses money, and presenting it as the headline is the most common way a genuine backtest
 * still misleads.
 */
export function performanceMetrics(returnsR: number[], periodsPerYear = 365): PerformanceMetrics {
  const n = returnsR.length;
  if (n === 0) {
    return {
      trades: 0, totalR: 0, meanR: 0, medianR: 0, winRate: 0, profitFactor: null,
      expectancy: 0, averageWin: 0, averageLoss: 0, payoffRatio: null, sharpe: null,
      sortino: null, maxDrawdownR: 0, calmar: null, meanRExcludingBest5: 0, meanRCi95: [0, 0],
    };
  }

  const wins = returnsR.filter((r) => r > 0);
  const losses = returnsR.filter((r) => r < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const m = mean(returnsR);
  const sd = sampleStd(returnsR);
  const downside = returnsR.filter((r) => r < 0);
  const downsideDev = downside.length > 1 ? sampleStd(downside) : 0;

  // Equity in R, and its worst peak-to-trough.
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const r of returnsR) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  const sorted = [...returnsR].sort((a, b) => b - a);
  const exBest5 = sorted.slice(Math.min(5, sorted.length));

  const annualFactor = Math.sqrt(periodsPerYear);
  const totalR = returnsR.reduce((a, b) => a + b, 0);

  return {
    trades: n,
    totalR,
    meanR: m,
    medianR: quantile(returnsR, 0.5),
    winRate: wins.length / n,
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
    expectancy: m,
    averageWin: wins.length === 0 ? 0 : grossWin / wins.length,
    averageLoss: losses.length === 0 ? 0 : grossLoss / losses.length,
    payoffRatio:
      wins.length === 0 || losses.length === 0 ? null : grossWin / wins.length / (grossLoss / losses.length),
    sharpe: sd === 0 ? null : (m / sd) * annualFactor,
    sortino: downsideDev === 0 ? null : (m / downsideDev) * annualFactor,
    maxDrawdownR: maxDd,
    calmar: maxDd === 0 ? null : totalR / maxDd,
    meanRExcludingBest5: exBest5.length === 0 ? 0 : mean(exBest5),
    meanRCi95: bootstrapMeanCi(returnsR),
  };
}

/**
 * Bootstrap confidence interval on the mean.
 *
 * Deterministically seeded: a confidence interval that moves between runs is one nobody can cite,
 * and a research artefact has to be reproducible from its inputs alone.
 */
export function bootstrapMeanCi(values: number[], iterations = 2000, seed = 12345): [number, number] {
  if (values.length < 2) return [0, 0];
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let acc = 0;
    for (let j = 0; j < values.length; j++) acc += values[Math.floor(rand() * values.length)];
    means.push(acc / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iterations * 0.025)], means[Math.floor(iterations * 0.975)]];
}

/**
 * Deflated Sharpe ratio (Bailey & López de Prado) — the discipline nobody wants (docs/18 §3.3).
 *
 * Try five hundred configurations and the best will look excellent by chance alone. This is the
 * mechanism by which most published backtests are wrong, and it is invisible to every individual
 * step of an otherwise-correct process: each configuration was tested honestly, and the selection
 * across them was not.
 *
 * The correction needs the **number of trials actually run**, which is why the harness owns that
 * counter rather than the researcher (`trial-counter.ts`). It also needs the skew and kurtosis of
 * the returns, because a Sharpe computed on fat-tailed, negatively-skewed returns is less
 * trustworthy than the same number on well-behaved ones.
 *
 * Returns the probability that the observed Sharpe exceeds what the best of `trials` random
 * strategies would have produced. Below ~0.95 the result is not distinguishable from luck.
 */
export function deflatedSharpe(params: {
  observedSharpe: number;
  trials: number;
  sampleSize: number;
  skew: number;
  kurtosis: number;
  /** Dispersion of Sharpes across the trials, when known. Estimated if omitted. */
  trialSharpeStd?: number;
}): { deflated: number; expectedMaxSharpe: number } {
  const { observedSharpe, trials, sampleSize, skew, kurtosis } = params;
  if (sampleSize < 2 || trials < 1) return { deflated: 0, expectedMaxSharpe: 0 };

  // Expected maximum Sharpe from `trials` draws of a zero-mean strategy. The Gumbel
  // approximation to the expected maximum of N normals.
  const EULER = 0.5772156649015329;
  const sd = params.trialSharpeStd ?? 1;
  const n = Math.max(trials, 2);
  const expectedMax =
    sd *
    ((1 - EULER) * inverseNormalCdf(1 - 1 / n) + EULER * inverseNormalCdf(1 - 1 / (n * Math.E)));

  // Standard error of the Sharpe estimate, adjusted for non-normal returns.
  const variance =
    (1 - skew * observedSharpe + ((kurtosis - 1) / 4) * observedSharpe * observedSharpe) /
    (sampleSize - 1);
  if (variance <= 0) return { deflated: 0, expectedMaxSharpe: expectedMax };

  const z = (observedSharpe - expectedMax) / Math.sqrt(variance);
  return { deflated: normalCdf(z), expectedMaxSharpe: expectedMax };
}

/**
 * Probability of Backtest Overfitting, by combinatorially-symmetric cross-validation.
 *
 * Estimates how often the configuration that looked best in-sample lands in the bottom half
 * out-of-sample. A PBO near 0.5 means the selection procedure has no skill — it is picking noise.
 *
 * Takes a matrix of per-configuration performance across time slices, which is what a walk-forward
 * over several candidates naturally produces.
 */
export function probabilityOfBacktestOverfitting(perfByConfigBySlice: number[][]): number | null {
  const configs = perfByConfigBySlice.length;
  if (configs < 2) return null;
  const slices = perfByConfigBySlice[0].length;
  if (slices < 4) return null;

  const half = Math.floor(slices / 2);
  let logits = 0;
  let count = 0;

  // Split the slices into contiguous in-sample / out-of-sample halves at every offset, rather
  // than enumerating all C(S, S/2) combinations — same idea, tractable, and the ordering matters
  // for time series anyway.
  for (let offset = 0; offset < slices - half; offset++) {
    const isRange = (i: number) => i >= offset && i < offset + half;

    const isPerf = perfByConfigBySlice.map((row) =>
      mean(row.filter((_, i) => isRange(i))),
    );
    const oosPerf = perfByConfigBySlice.map((row) =>
      mean(row.filter((_, i) => !isRange(i))),
    );

    let best = 0;
    for (let c = 1; c < configs; c++) if (isPerf[c] > isPerf[best]) best = c;

    // Where the in-sample winner ranks out of sample.
    const rank = oosPerf.filter((p) => p < oosPerf[best]).length;
    const relative = (rank + 0.5) / configs;
    const clamped = Math.min(0.999, Math.max(0.001, relative));
    logits += Math.log(clamped / (1 - clamped));
    count++;
  }

  if (count === 0) return null;
  const meanLogit = logits / count;
  // Fraction of splits where the in-sample winner underperformed the median out of sample.
  return 1 / (1 + Math.exp(meanLogit));
}

export function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = sampleStd(values);
  if (sd === 0) return 0;
  return values.reduce((a, v) => a + ((v - m) / sd) ** 3, 0) / n;
}

export function kurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 3;
  const m = mean(values);
  const sd = sampleStd(values);
  if (sd === 0) return 3;
  return values.reduce((a, v) => a + ((v - m) / sd) ** 4, 0) / n;
}

/** Abramowitz & Stegun 7.1.26 — accurate to ~1e-7, which is far beyond what is needed here. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Acklam's rational approximation to the normal quantile. */
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
