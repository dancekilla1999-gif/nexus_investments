import { Window } from './window';
import * as k from './kernels/indicators';

export type FeatureCategory =
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'structure'
  | 'statistical';

/**
 * A feature is a registry entry, not a function call (docs/17 §3.1).
 *
 * `version` is part of the model contract. A model records the exact feature ids **and versions**
 * it was trained on, and inference refuses to score a vector that does not match. Changing an
 * indicator's computation without bumping its version is the single easiest way to silently
 * break a production model — the code still runs, the numbers still look plausible, and the
 * distribution the model was fit on has quietly moved underneath it.
 */
export interface FeatureSpec {
  id: string;
  version: number;
  category: FeatureCategory;
  /**
   * Bars required before the value means anything.
   *
   * Enforced, not advisory. A 200-EMA over 40 bars is not an approximate 200-EMA, it is a
   * different number that happens to look reasonable on a chart — and emitting it is how a
   * backtest acquires a spurious edge at the start of every walk-forward window.
   */
  warmupBars: number;
  compute: (w: Window) => number | null;
}

/**
 * Bars per year, for annualising volatility. Derived from the timeframe rather than assumed,
 * because crypto trades continuously — 365 days, not 252 — and getting this wrong scales every
 * volatility feature by a constant that differs per timeframe.
 */
export const BARS_PER_YEAR: Record<string, number> = {
  '1m': 525_600,
  '5m': 105_120,
  '15m': 35_040,
  '30m': 17_520,
  '1h': 8_760,
  '4h': 2_190,
  '1d': 365,
  '1w': 52,
};

function spec(
  id: string,
  category: FeatureCategory,
  warmupBars: number,
  compute: (w: Window) => number | null,
  version = 1,
): FeatureSpec {
  return { id, version, category, warmupBars, compute };
}

/**
 * Builds the feature set for one timeframe.
 *
 * Parameterised expansion is deliberate: `rsi_14` and `rsi_7` answer genuinely different
 * questions about the same series, and a model benefits from seeing a short and a long version of
 * the same idea. What is *not* done is padding the count with near-duplicates — every period here
 * is roughly double the last, so consecutive features are not measuring the same thing twice.
 */
export function buildFeatureSet(timeframe: string): FeatureSpec[] {
  const barsPerYear = BARS_PER_YEAR[timeframe] ?? 8_760;
  const out: FeatureSpec[] = [];

  // ── Trend (28) ──
  for (const p of [10, 20, 50, 100, 200]) {
    out.push(spec(`price_vs_sma_${p}`, 'trend', p, k.priceVsSma(p)));
    out.push(spec(`price_vs_ema_${p}`, 'trend', p, k.priceVsEma(p)));
  }
  for (const [f, s] of [
    [9, 21],
    [21, 50],
    [50, 200],
  ] as const) {
    out.push(spec(`ma_spread_${f}_${s}`, 'trend', s, k.maSpread(f, s)));
  }
  for (const p of [20, 50]) {
    out.push(spec(`vwma_dist_${p}`, 'trend', p, k.vwma(p)));
    out.push(spec(`linreg_slope_${p}`, 'trend', p, k.linregSlope(p)));
    out.push(spec(`linreg_r2_${p}`, 'trend', p, k.linregR2(p)));
  }
  for (const p of [14, 28]) {
    out.push(spec(`adx_${p}`, 'trend', p * 2 + 1, (w) => k.adxTriple(w, p)?.adx ?? null));
    out.push(spec(`plus_di_${p}`, 'trend', p * 2 + 1, (w) => k.adxTriple(w, p)?.plusDi ?? null));
    out.push(spec(`minus_di_${p}`, 'trend', p * 2 + 1, (w) => k.adxTriple(w, p)?.minusDi ?? null));
    out.push(
      spec(`di_spread_${p}`, 'trend', p * 2 + 1, (w) => {
        const t = k.adxTriple(w, p);
        return t ? t.plusDi - t.minusDi : null;
      }),
    );
  }
  for (const p of [14, 25]) out.push(spec(`aroon_osc_${p}`, 'trend', p + 1, (w) => k.aroonOsc(w, p)));

  // ── Momentum (22) ──
  for (const p of [7, 14, 21, 30]) out.push(spec(`rsi_${p}`, 'momentum', p + 1, (w) => k.rsi(w, p)));
  for (const p of [14, 28]) {
    out.push(spec(`stoch_k_${p}`, 'momentum', p + 3, (w) => k.stochastic(w, p, 3)));
    out.push(spec(`williams_r_${p}`, 'momentum', p, (w) => k.williamsR(w, p)));
    out.push(spec(`cci_${p}`, 'momentum', p, (w) => k.cci(w, p)));
    out.push(spec(`mfi_${p}`, 'momentum', p + 1, (w) => k.mfi(w, p)));
  }
  for (const [f, s, g] of [
    [12, 26, 9],
    [5, 35, 5],
  ] as const) {
    out.push(spec(`macd_${f}_${s}`, 'momentum', s + g, (w) => k.macdParts(w, f, s, g)?.macd ?? null));
    out.push(
      spec(`macd_signal_${f}_${s}`, 'momentum', s + g, (w) => k.macdParts(w, f, s, g)?.signal ?? null),
    );
    out.push(
      spec(`macd_hist_${f}_${s}`, 'momentum', s + g, (w) => k.macdParts(w, f, s, g)?.histogram ?? null),
    );
  }
  for (const p of [1, 5, 10, 20]) out.push(spec(`roc_${p}`, 'momentum', p + 1, k.roc(p)));

  // ── Volatility (20) ──
  for (const p of [14, 28]) {
    out.push(spec(`atr_pct_${p}`, 'volatility', p + 1, (w) => k.atrPercent(w, p)));
    out.push(spec(`keltner_pos_${p}`, 'volatility', p + 1, (w) => k.keltnerPosition(w, p, 2)));
  }
  for (const p of [20, 50]) {
    out.push(spec(`bb_width_${p}`, 'volatility', p, (w) => k.bollinger(w, p, 2)?.width ?? null));
    out.push(spec(`bb_percent_b_${p}`, 'volatility', p, (w) => k.bollinger(w, p, 2)?.percentB ?? null));
    out.push(spec(`donchian_pos_${p}`, 'volatility', p, (w) => k.donchianPosition(w, p)));
  }
  for (const p of [10, 20, 50]) {
    out.push(spec(`realized_vol_${p}`, 'volatility', p + 1, (w) => k.realizedVol(w, p, barsPerYear)));
    out.push(spec(`parkinson_vol_${p}`, 'volatility', p, (w) => k.parkinsonVol(w, p, barsPerYear)));
  }
  out.push(spec('vol_ratio_10_50', 'volatility', 51, (w) => k.volRatio(w, 10, 50, barsPerYear)));
  out.push(spec('vol_ratio_5_20', 'volatility', 21, (w) => k.volRatio(w, 5, 20, barsPerYear)));
  for (const p of [20, 50]) {
    out.push(spec(`vol_percentile_${p}`, 'volatility', p + 100 + 1, (w) => k.volPercentile(w, p, 100)));
  }

  // ── Volume (12) ──
  for (const p of [20, 50]) {
    out.push(spec(`obv_slope_${p}`, 'volume', p + 1, (w) => k.obvSlope(w, p)));
    out.push(spec(`cmf_${p}`, 'volume', p, (w) => k.cmf(w, p)));
    out.push(spec(`vwap_dist_${p}`, 'volume', p, (w) => k.vwapDistance(w, p)));
    out.push(spec(`volume_z_${p}`, 'volume', p, (w) => k.volumeZScore(w, p)));
  }
  for (const p of [5, 10]) {
    out.push(
      spec(`volume_ratio_${p}`, 'volume', p + 50, (w) => {
        if (w.length < p + 50) return null;
        const recent = w.volume.slice(-p).reduce((a, b) => a + b, 0) / p;
        const base = w.volume.slice(-50).reduce((a, b) => a + b, 0) / 50;
        return base === 0 ? null : recent / base;
      }),
    );
  }
  out.push(
    spec('up_volume_share_20', 'volume', 21, (w) => {
      if (w.length < 21) return null;
      let up = 0;
      let total = 0;
      for (let i = w.length - 20; i < w.length; i++) {
        total += w.volume[i];
        if (w.close[i] > w.close[i - 1]) up += w.volume[i];
      }
      return total === 0 ? null : up / total;
    }),
  );
  out.push(
    spec('volume_trend_20', 'volume', 20, (w) => {
      if (w.length < 20) return null;
      const first = w.volume.slice(-20, -10).reduce((a, b) => a + b, 0);
      const second = w.volume.slice(-10).reduce((a, b) => a + b, 0);
      return first === 0 ? null : second / first - 1;
    }),
  );

  // ── Market structure (14) ──
  for (const lb of [3, 5, 10]) {
    out.push(spec(`structure_state_${lb}`, 'structure', lb * 6, (w) => k.structureState(w, lb)));
    out.push(
      spec(`dist_resistance_${lb}`, 'structure', lb * 6, (w) => k.distanceToResistance(w, lb, 14)),
    );
    out.push(spec(`dist_support_${lb}`, 'structure', lb * 6, (w) => k.distanceToSupport(w, lb, 14)));
  }
  for (const p of [20, 50, 100]) {
    out.push(spec(`range_pos_${p}`, 'structure', p, (w) => k.rangePosition(w, p)));
  }
  out.push(
    spec('fvg_bullish_50', 'structure', 50, (w) => {
      if (w.length < 50) return null;
      return k.fairValueGapCount(sliceWindow(w, 50), 'bullish');
    }),
  );
  out.push(
    spec('fvg_bearish_50', 'structure', 50, (w) => {
      if (w.length < 50) return null;
      return k.fairValueGapCount(sliceWindow(w, 50), 'bearish');
    }),
  );

  // ── Statistical (22) ──
  for (const p of [1, 3, 5, 10, 20, 50]) out.push(spec(`log_return_${p}`, 'statistical', p + 1, k.logReturn(p)));
  for (const p of [20, 50]) {
    out.push(spec(`return_skew_${p}`, 'statistical', p + 1, (w) => k.returnSkew(w, p)));
    out.push(spec(`return_kurtosis_${p}`, 'statistical', p + 1, (w) => k.returnKurtosis(w, p)));
    out.push(spec(`return_iqr_${p}`, 'statistical', p + 1, (w) => k.returnIqr(w, p)));
    out.push(spec(`price_quantile_${p}`, 'statistical', p, (w) => k.priceQuantile(w, p)));
    out.push(spec(`bars_since_high_${p}`, 'statistical', p, (w) => k.barsSinceHigh(w, p)));
    out.push(spec(`bars_since_low_${p}`, 'statistical', p, (w) => k.barsSinceLow(w, p)));
  }
  for (const lag of [1, 2, 5]) {
    out.push(spec(`autocorr_50_lag${lag}`, 'statistical', 50 + lag + 1, (w) => k.autocorrelation(w, 50, lag)));
  }
  out.push(spec('hurst_100', 'statistical', 101, (w) => k.hurst(w, 100)));

  assertUniqueIds(out);
  return out;
}

/** A duplicate id would silently overwrite a column in the vector. */
function assertUniqueIds(specs: FeatureSpec[]): void {
  const seen = new Set<string>();
  for (const s of specs) {
    if (seen.has(s.id)) throw new Error(`Duplicate feature id in registry: ${s.id}`);
    seen.add(s.id);
  }
}

function sliceWindow(w: Window, n: number): Window {
  const start = Math.max(0, w.length - n);
  return {
    openTime: w.openTime.slice(start),
    closeTime: w.closeTime.slice(start),
    open: w.open.slice(start),
    high: w.high.slice(start),
    low: w.low.slice(start),
    close: w.close.slice(start),
    volume: w.volume.slice(start),
    length: w.length - start,
  };
}

/**
 * The maximum warmup across the set — how much history a vector needs before *any* of it is
 * fully populated. Callers use this to size their point-in-time read.
 */
export function requiredHistory(specs: FeatureSpec[]): number {
  return specs.reduce((m, s) => Math.max(m, s.warmupBars), 0);
}

/**
 * A stable hash of the set's ids and versions — the contract a model is bound to.
 *
 * Sorted before hashing so the value depends on the *content* of the set rather than on the
 * order the registry happened to build it in. An accidental reordering must not read as a
 * contract change, and a genuine change must not be maskable by reordering.
 */
export function featureSetVersion(specs: FeatureSpec[]): string {
  const parts = specs.map((s) => `${s.id}@${s.version}`).sort();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const joined = parts.join('|');
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${parts.length}-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
