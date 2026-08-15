import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CandleRepository } from '../marketdata/candle.repository';
import { DataQualityService, QualityVerdict } from '../marketdata/data-quality.service';
import { TIMEFRAMES, Timeframe } from '../marketdata/ohlcv-provider.interface';
import { FeatureSpec, buildFeatureSet, featureSetVersion, requiredHistory } from './registry';
import { Window, toWindow } from './window';

export interface FeatureVector {
  symbol: string;
  /** The timeframe the vector is anchored to. Higher timeframes enter as prefixed columns. */
  timeframe: Timeframe;
  asOf: Date;
  /** The bar the anchor timeframe was on. */
  barOpenTime: Date;
  featureSetVersion: string;
  /**
   * The higher timeframes actually folded in.
   *
   * Part of the vector rather than an argument the caller remembers, because a contract that does
   * not fully determine the computation is not a contract — recomputing with a different context
   * set produces different columns and reads as skew when nothing has skewed.
   */
  contextTimeframes: Timeframe[];
  values: Record<string, number | null>;
  /** Ids that came back null. A vector with these is incomplete by construction. */
  missing: string[];
  /** Deterministic digest of the values — the offline/online comparison key. */
  hash: string;
}

/**
 * How many bars of the anchor timeframe a higher timeframe contributes. Kept small: the point of
 * a higher-timeframe column is context, and one bar of weekly context is worth more than fifty
 * columns of it.
 */
const HIGHER_TIMEFRAME_ORDER: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

/**
 * The feature engine (docs/17 §3).
 *
 * **One implementation, serving both the backtest and the live path.** There is no separate
 * "backtest indicator library" anywhere in this repository, and there must never be one: the most
 * common way a quantitative system fails in production is train/serve skew, where the backtest
 * computed an indicator over closed candles and the live path computed it over a forming one.
 * Writing the code twice guarantees the two drift apart eventually, and the failure is silent —
 * the model simply starts seeing a distribution it was never fit on.
 *
 * The engine therefore takes an `asOf` and reads through `CandleRepository`, which has no
 * event-time filter. A backtest is not a different code path; it is the same call with an older
 * `asOf`.
 */
@Injectable()
export class FeatureEngineService {
  private readonly logger = new Logger(FeatureEngineService.name);
  private readonly setCache = new Map<string, FeatureSpec[]>();

  constructor(
    private readonly candles: CandleRepository,
    private readonly quality: DataQualityService,
  ) {}

  featureSetFor(timeframe: Timeframe): FeatureSpec[] {
    let set = this.setCache.get(timeframe);
    if (!set) {
      set = buildFeatureSet(timeframe);
      this.setCache.set(timeframe, set);
    }
    return set;
  }

  /**
   * Higher timeframes that contribute context to an anchor.
   *
   * The rule that keeps this honest: a higher-timeframe feature enters the vector using only the
   * last higher-timeframe bar that has **closed** (docs/17 §3.3). At 14:05 the 4h columns come
   * from the 12:00 bar; the forming 16:00 bar does not exist. It is enforced structurally — the
   * higher-timeframe window is fetched by the same `asOf`-filtered read, so an unclosed bar is
   * not in the store to be picked up.
   */
  higherTimeframesFor(anchor: Timeframe): Timeframe[] {
    const idx = HIGHER_TIMEFRAME_ORDER.indexOf(anchor);
    if (idx === -1) return [];
    return HIGHER_TIMEFRAME_ORDER.slice(idx + 1);
  }

  /**
   * Computes the vector for (symbol, anchor timeframe) as of an instant.
   *
   * Returns `null` when the data quality gate refuses. Not a partial vector, not a vector with a
   * quality flag attached — nothing. Every stage downstream is entitled to assume that a vector
   * it has been handed came from data that passed (docs/19 §1).
   */
  async compute(params: {
    symbol: string;
    timeframe: Timeframe;
    asOf: Date;
    /** Higher timeframes to fold in. Defaults to every one above the anchor. */
    contextTimeframes?: Timeframe[];
    /** Skip the gate. Only for tests that are exercising the engine itself. */
    skipQualityGate?: boolean;
  }): Promise<{ vector: FeatureVector | null; quality: QualityVerdict | null }> {
    const anchorSet = this.featureSetFor(params.timeframe);
    const needed = requiredHistory(anchorSet);

    let verdict: QualityVerdict | null = null;
    if (!params.skipQualityGate) {
      verdict = await this.quality.evaluate({
        symbol: params.symbol,
        timeframe: params.timeframe,
        asOf: params.asOf,
        policy: { requiredBars: needed },
      });
      if (!verdict.passed) return { vector: null, quality: verdict };
    }

    const anchorWindow = await this.windowFor(params.symbol, params.timeframe, params.asOf, needed);
    if (!anchorWindow || anchorWindow.length === 0) return { vector: null, quality: verdict };

    const values: Record<string, number | null> = {};
    const missing: string[] = [];

    this.applySet(anchorSet, anchorWindow, '', values, missing);

    const contexts = params.contextTimeframes ?? this.higherTimeframesFor(params.timeframe);
    for (const tf of contexts) {
      const set = this.featureSetFor(tf);
      const window = await this.windowFor(params.symbol, tf, params.asOf, requiredHistory(set));
      if (!window || window.length === 0) {
        // A missing higher timeframe is recorded as missing columns, not skipped silently — the
        // model must be able to tell "the weekly said nothing" from "there was no weekly".
        for (const s of set) {
          values[`${tf}_${s.id}`] = null;
          missing.push(`${tf}_${s.id}`);
        }
        continue;
      }
      this.applySet(set, window, `${tf}_`, values, missing);
    }

    // Cross-timeframe agreement: the feature the user's example is actually about — 1H bullish
    // against 1D bearish is a materially different setup from full alignment, and a model can
    // only learn that if the conflict is representable.
    this.addAlignmentFeatures(values, params.timeframe, contexts);

    const vector: FeatureVector = {
      symbol: params.symbol,
      timeframe: params.timeframe,
      asOf: params.asOf,
      barOpenTime: new Date(anchorWindow.openTime[anchorWindow.length - 1]),
      featureSetVersion: this.versionFor(params.timeframe, contexts),
      contextTimeframes: contexts,
      values,
      missing,
      hash: hashValues(values),
    };

    return { vector, quality: verdict };
  }

  private applySet(
    specs: FeatureSpec[],
    window: Window,
    prefix: string,
    values: Record<string, number | null>,
    missing: string[],
  ): void {
    for (const s of specs) {
      const key = `${prefix}${s.id}`;

      // Warmup is enforced here rather than left to each kernel. A kernel that happens to return
      // a number from a short window is not a kernel to trust — it is one that will produce a
      // plausible, wrong value at the start of every walk-forward window.
      if (window.length < s.warmupBars) {
        values[key] = null;
        missing.push(key);
        continue;
      }

      let v: number | null;
      try {
        v = s.compute(window);
      } catch (err) {
        // A throwing kernel is a bug, and it must not take the whole vector down — but it must
        // also not silently become a zero.
        this.logger.error(`Feature ${key} threw: ${err instanceof Error ? err.message : String(err)}`);
        v = null;
      }

      if (v === null || !Number.isFinite(v)) {
        values[key] = null;
        missing.push(key);
      } else {
        values[key] = v;
      }
    }
  }

  /**
   * Signed agreement across timeframes, from each one's own trend state.
   *
   * Deliberately derived from features already in the vector rather than recomputed, so the
   * agreement number cannot disagree with the columns it summarises.
   */
  private addAlignmentFeatures(
    values: Record<string, number | null>,
    anchor: Timeframe,
    contexts: Timeframe[],
  ): void {
    const votes: number[] = [];

    const voteFrom = (prefix: string): number | null => {
      const spread = values[`${prefix}ma_spread_21_50`];
      const adxDi = values[`${prefix}di_spread_14`];
      if (spread === null || spread === undefined) return null;
      if (adxDi === null || adxDi === undefined) return Math.sign(spread);
      // Both must agree for a confident vote; a split reads as neutral rather than as the
      // average of two contradictory signs.
      const a = Math.sign(spread);
      const b = Math.sign(adxDi);
      return a === b ? a : 0;
    };

    const anchorVote = voteFrom('');
    if (anchorVote !== null) votes.push(anchorVote);
    for (const tf of contexts) {
      const v = voteFrom(`${tf}_`);
      if (v !== null) votes.push(v);
    }

    if (votes.length === 0) {
      values['tf_alignment'] = null;
      values['tf_conflict'] = null;
      values['tf_votes'] = null;
      return;
    }

    const sum = votes.reduce((a, b) => a + b, 0);
    const bull = votes.filter((v) => v > 0).length;
    const bear = votes.filter((v) => v < 0).length;

    values['tf_alignment'] = sum / votes.length;
    // 0 when every timeframe agrees, 1 when they are evenly split — the state that should read
    // as "no edge" rather than as a weak version of whichever side is marginally ahead.
    values['tf_conflict'] = bull + bear === 0 ? 0 : Math.min(bull, bear) / Math.max(bull, bear || 1);
    values['tf_votes'] = votes.length;
    void anchor;
  }

  private async windowFor(
    symbol: string,
    timeframe: Timeframe,
    asOf: Date,
    bars: number,
  ): Promise<Window | null> {
    const rows = await this.candles.knowableAt({ symbol, timeframe, asOf, limit: bars });
    if (rows.length === 0) return null;
    return toWindow(rows);
  }

  /** The contract identifier: anchor set plus every context set, order-independent. */
  versionFor(anchor: Timeframe, contexts: Timeframe[]): string {
    const parts = [
      featureSetVersion(this.featureSetFor(anchor)),
      ...contexts.map((tf) => `${tf}:${featureSetVersion(this.featureSetFor(tf))}`),
    ];
    return parts.join('|');
  }

  /** Total column count for a given anchor, including context and alignment columns. */
  columnCount(anchor: Timeframe, contexts?: Timeframe[]): number {
    const ctx = contexts ?? this.higherTimeframesFor(anchor);
    const base = this.featureSetFor(anchor).length;
    const extra = ctx.reduce((acc, tf) => acc + this.featureSetFor(tf).length, 0);
    return base + extra + 3;
  }
}

/**
 * The canonical text form of a feature value: 17 significant digits, or the literal `null`.
 *
 * 17 is not arbitrary — it is the smallest number of decimal digits that uniquely identifies
 * every IEEE-754 double, so `Number(canonical(x)) === x` for all finite x. 15 digits does not
 * suffice and 16 is not always enough either.
 *
 * This one function is used for **both** the hash and the stored representation, deliberately.
 * Two serialisations of the same value is two ways to disagree, and the whole point of the
 * artefact is that two independent runs produce the identical string.
 */
export function canonical(v: number | null): string {
  return v === null ? 'null' : v.toPrecision(17);
}

/**
 * Serialises a vector for storage, with every number as its canonical string.
 *
 * **Numbers are stored as text, and this is not fussiness.** Prisma's `Json` column does not
 * round-trip a double: writing `11.154987603973913` and reading it back yields
 * `11.15498760397391` — the query engine reformats the float somewhere between the driver and
 * JSONB, and one digit is gone. That is invisible in almost every application and fatal in this
 * one: the skew check compares recorded against recomputed exactly, so a storage layer that
 * quietly alters the last digit makes every verification fail and the mechanism worthless.
 *
 * Found by the milestone's own acceptance test, and confirmed with a direct probe against the
 * Prisma client rather than assumed.
 */
export function serialiseValues(values: Record<string, number | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(values).sort()) out[key] = canonical(values[key]);
  return out;
}

export function deserialiseValues(stored: Record<string, string>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, text] of Object.entries(stored)) out[key] = text === 'null' ? null : Number(text);
  return out;
}

/**
 * A digest that is identical for identical values and different for any change.
 *
 * Keys are **sorted** so the hash depends on content rather than on insertion order. `null`
 * serialises as the literal `null` rather than being omitted, so a vector missing a column and a
 * vector with that column null are different hashes — they are different situations.
 */
export function hashValues(values: Record<string, number | null>): string {
  const keys = Object.keys(values).sort();
  const parts: string[] = [];
  for (const key of keys) parts.push(`${key}=${canonical(values[key])}`);
  return createHash('sha256').update(parts.join(';')).digest('hex');
}

export { TIMEFRAMES };
