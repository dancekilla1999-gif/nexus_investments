import { Window, finite, last } from '../window';
import {
  Series,
  ema,
  linreg,
  logReturns,
  mean,
  quantile,
  rma,
  rollingMax,
  rollingMin,
  sampleStd,
  sma,
  stddev,
} from './series';

/**
 * Indicator kernels, each returning the value **at the last bar of the window**.
 *
 * Two conventions hold throughout and both are load-bearing:
 *
 *   1. **`null` when not computable**, never a fallback number. See `window.ts` for why zero is
 *      the wrong answer to "unknown".
 *   2. **The window's last bar is the current bar and it is closed.** Nothing here peeks forward,
 *      because nothing here *can*: the window is assembled by a point-in-time read and contains
 *      no future bars to peek at. The lookahead defence is the data layer's, not each kernel's —
 *      which is why it actually holds.
 */

// ── Trend ───────────────────────────────────────────────────────────────

export const smaOf = (period: number) => (w: Window) => lastOf(sma(w.close, period));
export const emaOf = (period: number) => (w: Window) => lastOf(ema(w.close, period));

/** Price relative to a moving average, in percent — scale-free, unlike the raw MA. */
export const priceVsSma = (period: number) => (w: Window) => {
  const m = lastOf(sma(w.close, period));
  if (m === null || m === 0) return null;
  return finite((last(w.close) / m - 1) * 100);
};

export const priceVsEma = (period: number) => (w: Window) => {
  const m = lastOf(ema(w.close, period));
  if (m === null || m === 0) return null;
  return finite((last(w.close) / m - 1) * 100);
};

/** Fast MA above slow MA, as a percentage spread. The classic trend-state feature. */
export const maSpread = (fast: number, slow: number) => (w: Window) => {
  const f = lastOf(ema(w.close, fast));
  const s = lastOf(ema(w.close, slow));
  if (f === null || s === null || s === 0) return null;
  return finite((f / s - 1) * 100);
};

export const vwma = (period: number) => (w: Window) => {
  if (w.length < period) return null;
  let pv = 0;
  let v = 0;
  for (let i = w.length - period; i < w.length; i++) {
    pv += w.close[i] * w.volume[i];
    v += w.volume[i];
  }
  if (v === 0) return null;
  const m = pv / v;
  return finite((last(w.close) / m - 1) * 100);
};

export const linregSlope = (period: number) => (w: Window) => {
  if (w.length < period) return null;
  const r = linreg(w.close.slice(-period));
  if (!r) return null;
  // Normalised by price so the slope is comparable across assets and price levels.
  const px = last(w.close);
  return px === 0 ? null : finite((r.slope / px) * 100 * period);
};

export const linregR2 = (period: number) => (w: Window) => {
  if (w.length < period) return null;
  const r = linreg(w.close.slice(-period));
  return r ? finite(r.r2) : null;
};

/**
 * ADX with +DI and −DI, Wilder's method.
 *
 * Returns the whole triple because callers want all three and recomputing is wasteful — the
 * directional indicators are what distinguish "strong trend up" from "strong trend down", and
 * ADX alone cannot.
 */
export function adxTriple(w: Window, period: number): { adx: number; plusDi: number; minusDi: number } | null {
  if (w.length < period * 2 + 1) return null;

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < w.length; i++) {
    const upMove = w.high[i] - w.high[i - 1];
    const downMove = w.low[i - 1] - w.low[i];
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        w.high[i] - w.low[i],
        Math.abs(w.high[i] - w.close[i - 1]),
        Math.abs(w.low[i] - w.close[i - 1]),
      ),
    );
  }

  const trS = rma(tr, period);
  const plusS = rma(plusDm, period);
  const minusS = rma(minusDm, period);

  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    const t = trS[i];
    const p = plusS[i];
    const m = minusS[i];
    if (t === null || p === null || m === null || t === 0) continue;
    const pdi = (p / t) * 100;
    const mdi = (m / t) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dx.length < period) return null;

  const adx = lastOf(rma(dx, period));
  const t = lastOf(trS);
  const p = lastOf(plusS);
  const m = lastOf(minusS);
  if (adx === null || t === null || p === null || m === null || t === 0) return null;

  return { adx, plusDi: (p / t) * 100, minusDi: (m / t) * 100 };
}

export function aroonOsc(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const hi = w.high.slice(-(period + 1));
  const lo = w.low.slice(-(period + 1));

  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 1; i < hi.length; i++) {
    if (hi[i] >= hi[hiIdx]) hiIdx = i;
    if (lo[i] <= lo[loIdx]) loIdx = i;
  }
  const up = ((period - (period - hiIdx)) / period) * 100;
  const down = ((period - (period - loIdx)) / period) * 100;
  return finite(up - down);
}

// ── Momentum ────────────────────────────────────────────────────────────

export function rsi(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < w.length; i++) {
    const d = w.close[i] - w.close[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }

  const g = lastOf(rma(gains, period));
  const l = lastOf(rma(losses, period));
  if (g === null || l === null) return null;

  // All-gains window: RSI is 100 by definition, not "undefined because we divided by zero".
  if (l === 0) return g === 0 ? 50 : 100;
  return finite(100 - 100 / (1 + g / l));
}

export function stochastic(w: Window, period: number, smoothK: number): number | null {
  if (w.length < period + smoothK) return null;

  const highs = rollingMax(w.high, period);
  const lows = rollingMin(w.low, period);
  const raw: number[] = [];
  for (let i = 0; i < w.length; i++) {
    const h = highs[i];
    const l = lows[i];
    if (h === null || l === null) continue;
    raw.push(h === l ? 50 : ((w.close[i] - l) / (h - l)) * 100);
  }
  if (raw.length < smoothK) return null;
  return lastOf(sma(raw, smoothK));
}

export function macdParts(
  w: Window,
  fast: number,
  slow: number,
  signal: number,
): { macd: number; signal: number; histogram: number } | null {
  if (w.length < slow + signal) return null;

  const f = ema(w.close, fast);
  const s = ema(w.close, slow);
  const line: number[] = [];
  for (let i = 0; i < w.length; i++) {
    if (f[i] === null || s[i] === null) continue;
    line.push((f[i] as number) - (s[i] as number));
  }
  if (line.length < signal) return null;

  const sig = lastOf(ema(line, signal));
  const macd = line[line.length - 1];
  if (sig === null) return null;

  // Normalised by price: a MACD of 300 means something different on BTC than on SOL, and a model
  // trained across symbols needs the comparable version.
  const px = last(w.close);
  if (px === 0) return null;
  return {
    macd: (macd / px) * 100,
    signal: (sig / px) * 100,
    histogram: ((macd - sig) / px) * 100,
  };
}

export function cci(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const tp = w.close.map((c, i) => (w.high[i] + w.low[i] + c) / 3);
  const m = lastOf(sma(tp, period));
  if (m === null) return null;

  const slice = tp.slice(-period);
  const meanDev = mean(slice.map((v) => Math.abs(v - m)));
  if (meanDev === 0) return null;
  return finite((last(tp) - m) / (0.015 * meanDev));
}

export function mfi(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const tp = w.close.map((c, i) => (w.high[i] + w.low[i] + c) / 3);

  let pos = 0;
  let neg = 0;
  for (let i = w.length - period; i < w.length; i++) {
    const flow = tp[i] * w.volume[i];
    if (tp[i] > tp[i - 1]) pos += flow;
    else if (tp[i] < tp[i - 1]) neg += flow;
  }
  if (neg === 0) return pos === 0 ? 50 : 100;
  return finite(100 - 100 / (1 + pos / neg));
}

export const roc = (period: number) => (w: Window) => {
  if (w.length < period + 1) return null;
  const prev = w.close[w.length - 1 - period];
  if (prev === 0) return null;
  return finite((last(w.close) / prev - 1) * 100);
};

export function williamsR(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const h = lastOf(rollingMax(w.high, period));
  const l = lastOf(rollingMin(w.low, period));
  if (h === null || l === null || h === l) return null;
  return finite(((h - last(w.close)) / (h - l)) * -100);
}

// ── Volatility ──────────────────────────────────────────────────────────

export function atr(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < w.length; i++) {
    tr.push(
      Math.max(
        w.high[i] - w.low[i],
        Math.abs(w.high[i] - w.close[i - 1]),
        Math.abs(w.low[i] - w.close[i - 1]),
      ),
    );
  }
  return lastOf(rma(tr, period));
}

/** ATR as a percentage of price — the form that is comparable across assets. */
export function atrPercent(w: Window, period: number): number | null {
  const a = atr(w, period);
  const px = last(w.close);
  if (a === null || px === 0) return null;
  return finite((a / px) * 100);
}

export function bollinger(
  w: Window,
  period: number,
  mult: number,
): { width: number; percentB: number } | null {
  if (w.length < period) return null;
  const m = lastOf(sma(w.close, period));
  const s = lastOf(stddev(w.close, period));
  if (m === null || s === null || m === 0) return null;

  const upper = m + mult * s;
  const lower = m - mult * s;
  const range = upper - lower;
  return {
    width: finite((range / m) * 100) ?? 0,
    // %B outside [0,1] is the informative case — it means price broke the band.
    percentB: range === 0 ? 0.5 : (last(w.close) - lower) / range,
  };
}

export function keltnerPosition(w: Window, period: number, mult: number): number | null {
  const m = lastOf(ema(w.close, period));
  const a = atr(w, period);
  if (m === null || a === null || a === 0) return null;
  return finite((last(w.close) - m) / (mult * a));
}

export function donchianPosition(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const h = lastOf(rollingMax(w.high, period));
  const l = lastOf(rollingMin(w.low, period));
  if (h === null || l === null || h === l) return null;
  return finite((last(w.close) - l) / (h - l));
}

/** Annualised realized volatility from close-to-close log returns. */
export function realizedVol(w: Window, period: number, barsPerYear: number): number | null {
  if (w.length < period + 1) return null;
  const r = logReturns(w.close.slice(-(period + 1)));
  const s = sampleStd(r);
  return finite(s * Math.sqrt(barsPerYear) * 100);
}

/**
 * Parkinson volatility — uses the high-low range rather than close-to-close.
 *
 * Roughly five times more efficient than the close-to-close estimator for the same sample, since
 * it uses the intrabar path instead of discarding it. Blind to gaps, which is why both are kept.
 */
export function parkinsonVol(w: Window, period: number, barsPerYear: number): number | null {
  if (w.length < period) return null;
  let acc = 0;
  for (let i = w.length - period; i < w.length; i++) {
    if (w.low[i] <= 0) return null;
    acc += Math.log(w.high[i] / w.low[i]) ** 2;
  }
  const v = Math.sqrt(acc / (4 * Math.log(2) * period));
  return finite(v * Math.sqrt(barsPerYear) * 100);
}

/** Short-window vol over long-window vol. A regime input: rising means the market is waking up. */
export function volRatio(w: Window, short: number, long: number, barsPerYear: number): number | null {
  const s = realizedVol(w, short, barsPerYear);
  const l = realizedVol(w, long, barsPerYear);
  if (s === null || l === null || l === 0) return null;
  return finite(s / l);
}

// ── Volume ──────────────────────────────────────────────────────────────

export function obvSlope(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const obv: number[] = [0];
  for (let i = 1; i < w.length; i++) {
    const dir = w.close[i] > w.close[i - 1] ? 1 : w.close[i] < w.close[i - 1] ? -1 : 0;
    obv.push(obv[i - 1] + dir * w.volume[i]);
  }
  const slice = obv.slice(-period);
  const r = linreg(slice);
  if (!r) return null;
  const scale = mean(w.volume.slice(-period));
  return scale === 0 ? null : finite(r.slope / scale);
}

export function cmf(w: Window, period: number): number | null {
  if (w.length < period) return null;
  let mfv = 0;
  let vol = 0;
  for (let i = w.length - period; i < w.length; i++) {
    const range = w.high[i] - w.low[i];
    if (range === 0) continue;
    mfv += ((w.close[i] - w.low[i] - (w.high[i] - w.close[i])) / range) * w.volume[i];
    vol += w.volume[i];
  }
  if (vol === 0) return null;
  return finite(mfv / vol);
}

/** Session-anchored VWAP is unavailable without session boundaries; this is rolling VWAP. */
export function vwapDistance(w: Window, period: number): number | null {
  if (w.length < period) return null;
  let pv = 0;
  let v = 0;
  for (let i = w.length - period; i < w.length; i++) {
    const tp = (w.high[i] + w.low[i] + w.close[i]) / 3;
    pv += tp * w.volume[i];
    v += w.volume[i];
  }
  if (v === 0) return null;
  const vwap = pv / v;
  return vwap === 0 ? null : finite((last(w.close) / vwap - 1) * 100);
}

export function volumeZScore(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const slice = w.volume.slice(-period);
  const s = sampleStd(slice);
  if (s === 0) return null;
  return finite((last(w.volume) - mean(slice)) / s);
}

// ── Market structure ────────────────────────────────────────────────────

export interface Swing {
  index: number;
  price: number;
  kind: 'high' | 'low';
}

/**
 * Fractal swing points: a bar whose high exceeds `lookback` bars on both sides, or whose low
 * undercuts them.
 *
 * Note the right-hand side requirement. A swing high is only confirmed `lookback` bars *after*
 * it happens, and this returns confirmed swings only — an "unconfirmed swing" is a guess about
 * bars that have not printed yet, which is the future by another name.
 */
export function swings(w: Window, lookback: number): Swing[] {
  const out: Swing[] = [];
  for (let i = lookback; i < w.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (w.high[j] >= w.high[i]) isHigh = false;
      if (w.low[j] <= w.low[i]) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: w.high[i], kind: 'high' });
    if (isLow) out.push({ index: i, price: w.low[i], kind: 'low' });
  }
  return out;
}

/**
 * Structure state as a number a model can use: +2 higher-high and higher-low, +1 one of them,
 * 0 unclear, −1/−2 the mirror.
 *
 * A categorical string would have to be one-hot encoded downstream; an ordinal encoding is
 * honest here because the states genuinely are ordered from bearish to bullish.
 */
export function structureState(w: Window, lookback: number): number | null {
  const s = swings(w, lookback);
  const highs = s.filter((x) => x.kind === 'high').slice(-2);
  const lows = s.filter((x) => x.kind === 'low').slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;

  const hh = highs[1].price > highs[0].price;
  const hl = lows[1].price > lows[0].price;
  const lh = highs[1].price < highs[0].price;
  const ll = lows[1].price < lows[0].price;

  if (hh && hl) return 2;
  if (ll && lh) return -2;
  if (hh || hl) return 1;
  if (ll || lh) return -1;
  return 0;
}

/** Distance to the nearest swing high above, in ATR units. Null when there is none. */
export function distanceToResistance(w: Window, lookback: number, atrPeriod: number): number | null {
  const a = atr(w, atrPeriod);
  if (a === null || a === 0) return null;
  const px = last(w.close);
  const above = swings(w, lookback)
    .filter((s) => s.kind === 'high' && s.price > px)
    .map((s) => s.price);
  if (above.length === 0) return null;
  return finite((Math.min(...above) - px) / a);
}

export function distanceToSupport(w: Window, lookback: number, atrPeriod: number): number | null {
  const a = atr(w, atrPeriod);
  if (a === null || a === 0) return null;
  const px = last(w.close);
  const below = swings(w, lookback)
    .filter((s) => s.kind === 'low' && s.price < px)
    .map((s) => s.price);
  if (below.length === 0) return null;
  return finite((px - Math.max(...below)) / a);
}

/**
 * Fair value gaps in the window: a three-bar pattern where bar 1's high is below bar 3's low
 * (bullish) or bar 1's low is above bar 3's high (bearish), leaving an untraded band.
 */
export function fairValueGapCount(w: Window, direction: 'bullish' | 'bearish'): number {
  let count = 0;
  for (let i = 2; i < w.length; i++) {
    if (direction === 'bullish' && w.high[i - 2] < w.low[i]) count++;
    if (direction === 'bearish' && w.low[i - 2] > w.high[i]) count++;
  }
  return count;
}

/** Position within the N-bar range: 0 at the low, 1 at the high. */
export function rangePosition(w: Window, period: number): number | null {
  return donchianPosition(w, period);
}

// ── Statistical ─────────────────────────────────────────────────────────

export const logReturn = (period: number) => (w: Window) => {
  if (w.length < period + 1) return null;
  const prev = w.close[w.length - 1 - period];
  const px = last(w.close);
  if (prev <= 0 || px <= 0) return null;
  return finite(Math.log(px / prev) * 100);
};

export function returnSkew(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const r = logReturns(w.close.slice(-(period + 1)));
  const m = mean(r);
  const s = sampleStd(r);
  if (s === 0) return null;
  return finite(mean(r.map((x) => ((x - m) / s) ** 3)));
}

export function returnKurtosis(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const r = logReturns(w.close.slice(-(period + 1)));
  const m = mean(r);
  const s = sampleStd(r);
  if (s === 0) return null;
  return finite(mean(r.map((x) => ((x - m) / s) ** 4)) - 3);
}

export function autocorrelation(w: Window, period: number, lag: number): number | null {
  if (w.length < period + lag + 1) return null;
  const r = logReturns(w.close.slice(-(period + lag + 1)));
  if (r.length <= lag) return null;
  const a = r.slice(0, r.length - lag);
  const b = r.slice(lag);
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return finite(num / Math.sqrt(da * db));
}

/**
 * Hurst exponent by rescaled range.
 *
 * ~0.5 is a random walk, above is trending/persistent, below is mean-reverting. Genuinely noisy
 * on short windows — it is included as one input among many rather than as a regime verdict, and
 * the model is free to learn to ignore it.
 */
export function hurst(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const r = logReturns(w.close.slice(-(period + 1)));
  if (r.length < 16) return null;

  const sizes: number[] = [];
  for (let n = 8; n <= r.length; n = Math.floor(n * 2)) sizes.push(n);
  if (sizes.length < 2) return null;

  const xs: number[] = [];
  const ys: number[] = [];

  for (const n of sizes) {
    const chunks = Math.floor(r.length / n);
    let rsAcc = 0;
    let counted = 0;
    for (let c = 0; c < chunks; c++) {
      const seg = r.slice(c * n, (c + 1) * n);
      const m = mean(seg);
      let cum = 0;
      let hi = -Infinity;
      let lo = Infinity;
      for (const v of seg) {
        cum += v - m;
        if (cum > hi) hi = cum;
        if (cum < lo) lo = cum;
      }
      const s = sampleStd(seg);
      if (s === 0) continue;
      rsAcc += (hi - lo) / s;
      counted++;
    }
    if (counted === 0) continue;
    xs.push(Math.log(n));
    ys.push(Math.log(rsAcc / counted));
  }
  if (xs.length < 2) return null;

  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  return finite(sxy / sxx);
}

/** Where the current realized vol sits in its own trailing distribution. */
export function volPercentile(w: Window, period: number, lookback: number): number | null {
  if (w.length < period + lookback + 1) return null;
  const r = logReturns(w.close);
  if (r.length < period + lookback) return null;

  const vols: number[] = [];
  for (let end = r.length - lookback; end <= r.length; end++) {
    vols.push(sampleStd(r.slice(end - period, end)));
  }
  const current = vols[vols.length - 1];
  const below = vols.filter((v) => v < current).length;
  return finite(below / vols.length);
}

export function priceQuantile(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const slice = w.close.slice(-period);
  const px = last(w.close);
  const below = slice.filter((v) => v < px).length;
  return finite(below / slice.length);
}

/** Bars since the window's high, normalised — a simple "how stale is the top" feature. */
export function barsSinceHigh(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const slice = w.high.slice(-period);
  let idx = 0;
  for (let i = 1; i < slice.length; i++) if (slice[i] >= slice[idx]) idx = i;
  return finite((slice.length - 1 - idx) / period);
}

export function barsSinceLow(w: Window, period: number): number | null {
  if (w.length < period) return null;
  const slice = w.low.slice(-period);
  let idx = 0;
  for (let i = 1; i < slice.length; i++) if (slice[i] <= slice[idx]) idx = i;
  return finite((slice.length - 1 - idx) / period);
}

/** Interquartile range of returns over the window, in percent. A robust dispersion measure. */
export function returnIqr(w: Window, period: number): number | null {
  if (w.length < period + 1) return null;
  const r = logReturns(w.close.slice(-(period + 1)));
  return finite((quantile(r, 0.75) - quantile(r, 0.25)) * 100);
}

// ── helpers ─────────────────────────────────────────────────────────────

function lastOf(s: Series): number | null {
  if (s.length === 0) return null;
  const v = s[s.length - 1];
  return v === null ? null : finite(v);
}
