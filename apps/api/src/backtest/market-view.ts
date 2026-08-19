import { Window } from '../features/window';
import { StoredCandle } from '../marketdata/candle.repository';

/**
 * What a strategy can see (docs/18 §4.1).
 *
 * **There is no method here that accepts a timestamp.** That is the entire design. A vectorised
 * backtest holds the whole series in scope at every step and relies on the author never indexing
 * past the current bar; this interface makes the mistake *inexpressible* rather than
 * discouraged — you cannot ask for bar `t+1` because there is no parameter through which `t+1`
 * could be named.
 *
 * `now` is readable, because a strategy legitimately needs to know the time. It is not writable
 * and it is not an argument to anything.
 *
 * The window returned is always **closed bars ending at `now`**. A forming bar is not visible,
 * for the same reason it is not visible live.
 */
export interface MarketView {
  readonly symbol: string;
  readonly timeframe: string;
  /** The replay clock: the close of the most recent visible bar. */
  readonly now: number;
  /** How many bars have been seen so far. */
  readonly barsSeen: number;

  /** The last `count` closed bars, oldest first. Shorter than asked for near the start. */
  bars(count: number): Window;

  /** The most recent closed bar. */
  latest(): Bar;

  /** A feature value at the current bar, or null if unavailable. */
  feature(id: string): number | null;

  /** Every feature at the current bar. */
  features(): Readonly<Record<string, number | null>>;
}

export interface Bar {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * The view implementation, driven by the engine's clock.
 *
 * The full series is held internally — it has to be, the data has to come from somewhere — but
 * `cursor` bounds every read and no public method can move it. Only the engine advances the
 * clock, and the engine does not hand the strategy a reference to itself.
 */
export class ReplayMarketView implements MarketView {
  private cursor = -1;
  private currentFeatures: Readonly<Record<string, number | null>> = {};

  private readonly openTime: number[];
  private readonly closeTime: number[];
  private readonly open: number[];
  private readonly high: number[];
  private readonly low: number[];
  private readonly close: number[];
  private readonly volume: number[];

  constructor(
    readonly symbol: string,
    readonly timeframe: string,
    candles: StoredCandle[],
  ) {
    const n = candles.length;
    this.openTime = new Array(n);
    this.closeTime = new Array(n);
    this.open = new Array(n);
    this.high = new Array(n);
    this.low = new Array(n);
    this.close = new Array(n);
    this.volume = new Array(n);

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      this.openTime[i] = c.openTime.getTime();
      this.closeTime[i] = c.closeTime.getTime();
      this.open[i] = Number(c.open);
      this.high[i] = Number(c.high);
      this.low[i] = Number(c.low);
      this.close[i] = Number(c.close);
      this.volume[i] = Number(c.volume);
    }
  }

  get length(): number {
    return this.openTime.length;
  }

  get now(): number {
    return this.cursor < 0 ? 0 : this.closeTime[this.cursor];
  }

  get barsSeen(): number {
    return this.cursor + 1;
  }

  /** Engine-only. Not part of `MarketView`, so a strategy holding a view cannot call it. */
  advance(features: Readonly<Record<string, number | null>>): boolean {
    if (this.cursor + 1 >= this.length) return false;
    this.cursor++;
    this.currentFeatures = features;
    return true;
  }

  /**
   * The bar the engine is about to simulate execution *into*.
   *
   * Engine-only and deliberately absent from `MarketView`: this is next-bar information, which
   * the fill logic needs and the strategy must never see. Keeping it off the public interface is
   * what stops a strategy from peeking at the bar its own order will fill in.
   */
  nextBarForExecution(): Bar | null {
    const i = this.cursor + 1;
    if (i >= this.length) return null;
    return this.barAt(i);
  }

  bars(count: number): Window {
    const end = this.cursor + 1;
    const start = Math.max(0, end - count);
    return {
      openTime: this.openTime.slice(start, end),
      closeTime: this.closeTime.slice(start, end),
      open: this.open.slice(start, end),
      high: this.high.slice(start, end),
      low: this.low.slice(start, end),
      close: this.close.slice(start, end),
      volume: this.volume.slice(start, end),
      length: end - start,
    };
  }

  latest(): Bar {
    if (this.cursor < 0) throw new Error('MarketView read before the clock started.');
    return this.barAt(this.cursor);
  }

  feature(id: string): number | null {
    return this.currentFeatures[id] ?? null;
  }

  features(): Readonly<Record<string, number | null>> {
    return this.currentFeatures;
  }

  private barAt(i: number): Bar {
    return {
      openTime: this.openTime[i],
      closeTime: this.closeTime[i],
      open: this.open[i],
      high: this.high[i],
      low: this.low[i],
      close: this.close[i],
      volume: this.volume[i],
    };
  }
}
