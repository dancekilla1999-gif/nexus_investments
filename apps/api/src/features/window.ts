import { StoredCandle } from '../marketdata/candle.repository';

/**
 * A bar window, columnar, oldest first.
 *
 * **Numbers, not `Prisma.Decimal`, and this is a deliberate exception to the platform's rule
 * that money is never a float.** Features are not money. They are model inputs whose downstream
 * consumer is a float32 tensor, so carrying 18-decimal precision through an EMA would cost a
 * great deal of arithmetic to produce a value that is truncated the moment it is scored. What
 * matters here instead is **determinism**: IEEE-754 double arithmetic is exactly reproducible
 * when the same operations run in the same order, which is what makes the offline/online
 * bit-for-bit invariant (docs/17 §3.4) testable at all.
 *
 * The rule stays absolute where it belongs — a feature value never becomes a balance, a fee, a
 * unit count or an order size without going back through `Prisma.Decimal`.
 */
export interface Window {
  openTime: number[];
  closeTime: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  /** Number of bars. */
  readonly length: number;
}

export function toWindow(candles: StoredCandle[]): Window {
  const n = candles.length;
  const w = {
    openTime: new Array<number>(n),
    closeTime: new Array<number>(n),
    open: new Array<number>(n),
    high: new Array<number>(n),
    low: new Array<number>(n),
    close: new Array<number>(n),
    volume: new Array<number>(n),
    length: n,
  };
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    w.openTime[i] = c.openTime.getTime();
    w.closeTime[i] = c.closeTime.getTime();
    w.open[i] = Number(c.open);
    w.high[i] = Number(c.high);
    w.low[i] = Number(c.low);
    w.close[i] = Number(c.close);
    w.volume[i] = Number(c.volume);
  }
  return w;
}

/**
 * Every kernel returns `number | null`, and `null` means "not computable here" — never zero.
 *
 * Zero is a value a model will happily learn from. An EMA that has not warmed up, an RSI over a
 * window with no losses, a division by a zero range: each of those is an absence, and encoding
 * absence as 0.0 teaches the model that the indicator was neutral when in fact it was unknown.
 * Nulls propagate to the feature vector, and a vector with nulls in required positions does not
 * get scored (docs/19 §1).
 */
export type Kernel = (w: Window) => number | null;

/** Guards against NaN and ±Infinity leaking out of a division. */
export function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function last<T>(xs: T[]): T {
  return xs[xs.length - 1];
}
