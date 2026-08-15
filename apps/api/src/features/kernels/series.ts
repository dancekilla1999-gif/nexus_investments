import { finite } from '../window';

/**
 * Series primitives. Every function here returns a **full series** the same length as its input,
 * with `null` in positions that are not yet computable, so composition never silently shifts an
 * index — the single most common way an indicator ends up off by one bar and quietly reads the
 * future.
 */
export type Series = Array<number | null>;

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 *
 * The seed matters and is a real source of disagreement between implementations: seeding with
 * the first value instead converges to the same place but differs for hundreds of bars, which is
 * enough to make one library's RSI disagree with another's on any window a model actually sees.
 * SMA-seeding is the Wilder/TA-Lib convention and is what the reference tests check against.
 */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA) — the 1/period variant used by RSI, ATR and ADX. */
export function rma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - period + 1 + j] * (j + 1);
    out[i] = acc / denom;
  }
  return out;
}

/** Hull MA: `WMA(2·WMA(n/2) − WMA(n), √n)` — much less lag, at the cost of overshoot. */
export function hma(values: number[], period: number): Series {
  const half = Math.floor(period / 2);
  const sqrt = Math.floor(Math.sqrt(period));
  if (half < 1 || sqrt < 1) return new Array(values.length).fill(null);

  const wHalf = wma(values, half);
  const wFull = wma(values, period);

  const diff: number[] = new Array(values.length).fill(0);
  const valid: boolean[] = new Array(values.length).fill(false);
  for (let i = 0; i < values.length; i++) {
    if (wHalf[i] !== null && wFull[i] !== null) {
      diff[i] = 2 * (wHalf[i] as number) - (wFull[i] as number);
      valid[i] = true;
    }
  }

  const firstValid = valid.indexOf(true);
  const out: Series = new Array(values.length).fill(null);
  if (firstValid === -1) return out;

  const smoothed = wma(diff.slice(firstValid), sqrt);
  for (let i = 0; i < smoothed.length; i++) out[firstValid + i] = smoothed[i];
  return out;
}

export function stddev(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const means = sma(values, period);

  for (let i = period - 1; i < values.length; i++) {
    const mean = means[i];
    if (mean === null) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - mean) ** 2;
    // Population standard deviation, matching the Bollinger Band convention.
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

export function rollingMax(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}

export function rollingMin(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}

export function logReturns(values: number[]): number[] {
  const out = new Array<number>(Math.max(0, values.length - 1));
  for (let i = 1; i < values.length; i++) {
    out[i - 1] = values[i] > 0 && values[i - 1] > 0 ? Math.log(values[i] / values[i - 1]) : 0;
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let acc = 0;
  for (const v of values) acc += v;
  return acc / values.length;
}

/** Sample standard deviation (n−1), for statistical features rather than bands. */
export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Ordinary-least-squares slope and R² of `y` against its own index.
 *
 * Returned together because the slope alone is misleading: a steep slope through noise and a
 * gentle slope through a clean trend are very different states, and R² is what separates them.
 */
export function linreg(y: number[]): { slope: number; r2: number } | null {
  const n = y.length;
  if (n < 3) return null;

  const xMean = (n - 1) / 2;
  const yMean = mean(y);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = y[i] - yMean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, r2 };
}

/** Z-score of the final value against its own trailing window. */
export function zscore(values: number[], period: number): number | null {
  if (values.length < period || period < 2) return null;
  const w = values.slice(-period);
  const s = sampleStd(w);
  if (s === 0) return null;
  return finite((w[w.length - 1] - mean(w)) / s);
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return finite(sxy / Math.sqrt(sxx * syy));
}
