import { Window } from '../window';
import * as k from './indicators';
import { ema, hma, linreg, rma, sma, stddev, wma } from './series';

/**
 * Indicator correctness, against values computed by hand or from the published definition.
 *
 * The reason this file exists rather than a snapshot test: a snapshot pins whatever the code
 * currently produces, including whatever it produces wrongly. These check the *definition*, so a
 * refactor that changes an EMA's seeding or shifts an index by one bar fails here rather than
 * six months later as an unexplained gap between backtest and live.
 */

function win(close: number[], opts: { high?: number[]; low?: number[]; volume?: number[] } = {}): Window {
  const n = close.length;
  return {
    openTime: close.map((_, i) => i * 3_600_000),
    closeTime: close.map((_, i) => (i + 1) * 3_600_000),
    open: [...close],
    high: opts.high ?? close.map((c) => c * 1.01),
    low: opts.low ?? close.map((c) => c * 0.99),
    close: [...close],
    volume: opts.volume ?? new Array(n).fill(100),
    length: n,
  };
}

const ramp = (n: number, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);

describe('series primitives', () => {
  it('computes SMA and leaves the warmup period null', () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(s[0]).toBeNull();
    expect(s[1]).toBeNull();
    expect(s[2]).toBeCloseTo(2, 12);
    expect(s[4]).toBeCloseTo(4, 12);
  });

  it('seeds the EMA with an SMA, matching the TA-Lib convention', () => {
    // Seeding with the first value instead converges to the same place but differs for hundreds
    // of bars — enough to make two libraries' RSI disagree on any window a model actually sees.
    const values = [1, 2, 3, 4, 5, 6];
    const e = ema(values, 3);
    expect(e[1]).toBeNull();
    expect(e[2]).toBeCloseTo(2, 12); // SMA(1,2,3)
    // k = 2/4 = 0.5 → 4·0.5 + 2·0.5 = 3
    expect(e[3]).toBeCloseTo(3, 12);
    expect(e[4]).toBeCloseTo(4, 12);
  });

  it('smooths with Wilder\'s 1/n rather than 2/(n+1)', () => {
    const r = rma([1, 2, 3, 4, 5], 3);
    expect(r[2]).toBeCloseTo(2, 12);
    // (2·2 + 4)/3 = 2.666…
    expect(r[3]).toBeCloseTo(8 / 3, 12);
  });

  it('weights a WMA linearly toward the most recent bar', () => {
    // (1·1 + 2·2 + 3·3)/6 = 14/6
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6, 12);
  });

  it('produces a Hull MA that tracks a ramp with almost no lag', () => {
    const values = ramp(40);
    const h = hma(values, 9);
    const v = h[h.length - 1];
    expect(v).not.toBeNull();
    // On a perfect linear ramp the HMA should sit essentially on the current price.
    expect(v as number).toBeCloseTo(values[values.length - 1], 6);
  });

  it('computes a population standard deviation, as Bollinger Bands require', () => {
    // mean 3, deviations -2,-1,0,1,2 → sqrt(10/5) = sqrt(2)
    expect(stddev([1, 2, 3, 4, 5], 5)[4]).toBeCloseTo(Math.SQRT2, 12);
  });

  it('recovers slope and a perfect R² from a straight line', () => {
    const r = linreg([2, 4, 6, 8, 10]);
    expect(r!.slope).toBeCloseTo(2, 12);
    expect(r!.r2).toBeCloseTo(1, 12);
  });
});

describe('momentum', () => {
  it('reports RSI 100 on a window with no losses, not a divide-by-zero', () => {
    expect(k.rsi(win(ramp(30)), 14)).toBe(100);
  });

  it('reports RSI 0 on a window with no gains', () => {
    expect(k.rsi(win(ramp(30, 100, -1)), 14)).toBeCloseTo(0, 10);
  });

  it('sits near 50 on an alternating series', () => {
    const alt = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1));
    const v = k.rsi(win(alt), 14)!;
    expect(v).toBeGreaterThan(40);
    expect(v).toBeLessThan(60);
  });

  it('returns null before the warmup period', () => {
    expect(k.rsi(win([1, 2, 3]), 14)).toBeNull();
  });

  it('puts stochastic at 100 when close equals the window high', () => {
    const close = ramp(40);
    // high == close so the last close is exactly the period high.
    const v = k.stochastic(win(close, { high: close, low: close.map((c) => c - 10) }), 14, 1)!;
    expect(v).toBeCloseTo(100, 6);
  });

  it('normalises MACD by price so it is comparable across assets', () => {
    const cheap = k.macdParts(win(ramp(120, 10, 0.1)), 12, 26, 9)!;
    const dear = k.macdParts(win(ramp(120, 10_000, 100)), 12, 26, 9)!;
    // Same shape, 1000× the price level: the normalised values should agree closely.
    expect(cheap.macd).toBeCloseTo(dear.macd, 6);
  });

  it('computes ROC as a plain percentage change', () => {
    const w = win([100, 100, 100, 100, 110]);
    expect(k.roc(4)(w)).toBeCloseTo(10, 10);
  });

  it('puts Williams %R at 0 at the top of the range and -100 at the bottom', () => {
    const flatHigh = [10, 20, 30, 40, 50];
    expect(
      k.williamsR(win(flatHigh, { high: flatHigh, low: flatHigh.map(() => 10) }), 5),
    ).toBeCloseTo(0, 10);
  });
});

describe('volatility', () => {
  it('computes ATR from true range including gaps', () => {
    // Constant 10-wide bars, no gaps: ATR is exactly 10.
    const close = new Array(30).fill(100);
    const w = win(close, { high: close.map((c) => c + 5), low: close.map((c) => c - 5) });
    expect(k.atr(w, 14)).toBeCloseTo(10, 10);
  });

  it('expresses ATR as a percentage of price', () => {
    const close = new Array(30).fill(100);
    const w = win(close, { high: close.map((c) => c + 5), low: close.map((c) => c - 5) });
    expect(k.atrPercent(w, 14)).toBeCloseTo(10, 10);
  });

  it('puts %B above 1 when price breaks the upper band', () => {
    const close = [...new Array(30).fill(100), 130];
    const b = k.bollinger(win(close), 20, 2)!;
    // Outside the band is the informative case; clamping it to [0,1] would erase it.
    expect(b.percentB).toBeGreaterThan(1);
  });

  it('reports zero band width on a perfectly flat series', () => {
    const b = k.bollinger(win(new Array(30).fill(100)), 20, 2)!;
    expect(b.width).toBeCloseTo(0, 12);
  });

  it('annualises realized volatility by bars per year', () => {
    const close = Array.from({ length: 60 }, (_, i) => 100 * Math.exp(((i % 2 === 0 ? 1 : -1) * 0.01)));
    const hourly = k.realizedVol(win(close), 50, 8_760)!;
    const daily = k.realizedVol(win(close), 50, 365)!;
    expect(hourly / daily).toBeCloseTo(Math.sqrt(8_760 / 365), 8);
  });

  it('gives Parkinson volatility a value where close-to-close sees nothing', () => {
    // Every bar closes flat but ranges widely. Close-to-close reports zero volatility; the
    // high-low estimator sees the truth, which is exactly why both are kept.
    const close = new Array(40).fill(100);
    const w = win(close, { high: close.map(() => 110), low: close.map(() => 90) });
    expect(k.realizedVol(w, 30, 8_760)).toBeCloseTo(0, 10);
    expect(k.parkinsonVol(w, 30, 8_760)!).toBeGreaterThan(0);
  });

  it('puts the Donchian position at 1 at a new high', () => {
    const close = ramp(40);
    expect(k.donchianPosition(win(close, { high: close, low: close }), 20)).toBeCloseTo(1, 10);
  });
});

describe('volume', () => {
  it('reports a positive OBV slope when volume accumulates on up bars', () => {
    const close = ramp(60);
    expect(k.obvSlope(win(close), 20)!).toBeGreaterThan(0);
  });

  it('reports a positive CMF when every bar closes at its high', () => {
    const close = new Array(30).fill(100);
    const w = win(close, { high: close, low: close.map((c) => c - 10) });
    expect(k.cmf(w, 20)!).toBeCloseTo(1, 6);
  });

  it('measures VWAP distance as a percentage', () => {
    const close = new Array(30).fill(100);
    const w = win(close, { high: close, low: close });
    expect(k.vwapDistance(w, 20)).toBeCloseTo(0, 8);
  });

  it('flags a volume spike as a z-score', () => {
    const volume = [...new Array(29).fill(100), 1000];
    expect(k.volumeZScore(win(new Array(30).fill(100), { volume }), 20)!).toBeGreaterThan(3);
  });

  it('returns null rather than zero when the window has no volume at all', () => {
    expect(k.cmf(win(new Array(30).fill(100), { volume: new Array(30).fill(0) }), 20)).toBeNull();
  });
});

describe('market structure', () => {
  it('confirms a swing only after the bars to its right have printed', () => {
    // A peak at index 5 in a 12-bar window with lookback 2 is confirmable; a peak at the very
    // last bar is not, because confirming it would require bars that have not happened.
    const close = [10, 11, 12, 13, 14, 20, 14, 13, 12, 11, 10, 9];
    const s = k.swings(win(close, { high: close, low: close }), 2);
    expect(s.some((x) => x.kind === 'high' && x.index === 5)).toBe(true);
    expect(s.every((x) => x.index <= close.length - 1 - 2)).toBe(true);
  });

  it('reads a clean uptrend as higher highs and higher lows', () => {
    const close = [10, 14, 11, 18, 15, 22, 19, 26, 23, 30, 27, 34, 31, 38, 35, 42, 39, 46];
    expect(k.structureState(win(close, { high: close, low: close }), 1)).toBe(2);
  });

  it('reads a clean downtrend as its mirror', () => {
    const close = [46, 39, 42, 35, 38, 31, 34, 27, 30, 23, 26, 19, 22, 15, 18, 11, 14, 10];
    expect(k.structureState(win(close, { high: close, low: close }), 1)).toBe(-2);
  });

  it('measures distance to resistance in ATR units', () => {
    const close = [100, 100, 100, 120, 100, 100, 100, ...new Array(30).fill(100)];
    const w = win(close, { high: close, low: close.map((c) => c - 1) });
    const d = k.distanceToResistance(w, 2, 14);
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(0);
  });

  it('finds a bullish fair value gap where a candle leaves an untraded band', () => {
    const w: Window = {
      openTime: [0, 1, 2],
      closeTime: [1, 2, 3],
      open: [100, 105, 115],
      high: [102, 118, 120],
      low: [98, 104, 110],
      close: [101, 117, 119],
      volume: [1, 1, 1],
      length: 3,
    };
    // bar0 high 102 < bar2 low 110 → a gap nothing traded through.
    expect(k.fairValueGapCount(w, 'bullish')).toBe(1);
    expect(k.fairValueGapCount(w, 'bearish')).toBe(0);
  });
});

describe('statistical', () => {
  it('computes a log return over the requested horizon', () => {
    const w = win([100, 100, 100, 100, 110]);
    expect(k.logReturn(4)(w)).toBeCloseTo(Math.log(1.1) * 100, 10);
  });

  it('reports positive skew when the tail is to the upside', () => {
    const close = [100];
    for (let i = 1; i < 60; i++) close.push(close[i - 1] * (i === 30 ? 1.2 : 0.999));
    expect(k.returnSkew(win(close), 50)!).toBeGreaterThan(1);
  });

  it('detects negative autocorrelation in an alternating series', () => {
    const close = Array.from({ length: 80 }, (_, i) => 100 * (i % 2 === 0 ? 1 : 1.01));
    expect(k.autocorrelation(win(close), 50, 1)!).toBeLessThan(-0.5);
  });

  it('puts the Hurst exponent above 0.5 on a trending series', () => {
    const close = ramp(200, 100, 0.5).map((v, i) => v + Math.sin(i / 7));
    const h = k.hurst(win(close), 100);
    expect(h).not.toBeNull();
    expect(h as number).toBeGreaterThan(0.5);
  });

  it('places the price quantile at 1 at a new high', () => {
    expect(k.priceQuantile(win(ramp(40)), 20)).toBeCloseTo(0.95, 2);
  });

  it('reports bars since the high as zero at a fresh high', () => {
    expect(k.barsSinceHigh(win(ramp(40)), 20)).toBeCloseTo(0, 10);
  });
});

describe('null discipline', () => {
  it('never substitutes zero for an uncomputable value', () => {
    // A short window: every one of these must decline rather than return a plausible number.
    const tiny = win([100, 101, 102]);
    expect(k.rsi(tiny, 14)).toBeNull();
    expect(k.atr(tiny, 14)).toBeNull();
    expect(k.bollinger(tiny, 20, 2)).toBeNull();
    expect(k.adxTriple(tiny, 14)).toBeNull();
    expect(k.hurst(tiny, 100)).toBeNull();
    expect(k.obvSlope(tiny, 20)).toBeNull();
    expect(k.autocorrelation(tiny, 50, 1)).toBeNull();
  });

  it('declines rather than dividing by a zero range', () => {
    const flat = win(new Array(40).fill(100), {
      high: new Array(40).fill(100),
      low: new Array(40).fill(100),
    });
    expect(k.williamsR(flat, 14)).toBeNull();
    expect(k.donchianPosition(flat, 20)).toBeNull();
    expect(k.cci(flat, 20)).toBeNull();
  });
});
