import { Window } from '../features/window';
import { logReturns, sampleStd } from '../features/kernels/series';

export type LabelValue = 1 | 0 | -1;

export interface TripleBarrierLabel {
  /** Index into the anchor series of the bar the position is entered on. */
  index: number;
  entryTime: number;
  entryPrice: number;
  upperBarrier: number;
  lowerBarrier: number;
  /** Vertical barrier — the holding-period cap. */
  deadline: number;
  /** +1 upper touched first, −1 lower touched first, 0 timed out. */
  label: LabelValue;
  /** When the label resolved. The label's *horizon*, which purging needs. */
  resolvedAt: number;
  /** Return actually achieved, in units of the stop distance. */
  realizedR: number;
  /**
   * True when the resolution had to be assumed rather than observed — a single bar whose high
   * touched the target and whose low touched the stop, with no finer data to say which came
   * first. See `resolvePessimistically`.
   */
  ambiguous: boolean;
}

export interface TripleBarrierConfig {
  /** Upper barrier at `entry + tpMultiple · σ`. */
  tpMultiple: number;
  /** Lower barrier at `entry − slMultiple · σ`. */
  slMultiple: number;
  /** Vertical barrier, in bars. */
  maxHoldingBars: number;
  /** Window for the volatility estimate that scales the barriers. */
  volLookback: number;
}

export const DEFAULT_BARRIER_CONFIG: TripleBarrierConfig = {
  tpMultiple: 2,
  slMultiple: 2,
  maxHoldingBars: 24,
  volLookback: 50,
};

/**
 * Triple-barrier labelling (docs/18 §1.1).
 *
 * Two properties make this the right label and neither is optional:
 *
 * **Volatility-scaled.** A 1% move in a calm market and a 1% move in a crisis are not the same
 * event. A fixed-percentage barrier quietly teaches the model to predict volatility instead of
 * direction — it will look like it has learned something, and what it has learned is when the
 * market is choppy.
 *
 * **Path-dependent.** The label resolves on what actually happened between entry and horizon,
 * not on the closing price at the horizon. That is what a real position with a stop experiences;
 * a close-to-close label describes a position nobody could have held.
 */
export function tripleBarrier(
  w: Window,
  config: TripleBarrierConfig = DEFAULT_BARRIER_CONFIG,
  options: {
    /**
     * A finer series covering the same span, used to resolve which barrier a bar touched first.
     *
     * Strongly recommended. Without it, a bar that spans both barriers is genuinely ambiguous and
     * has to be assumed — see `resolvePessimistically`.
     */
    path?: Window;
    /**
     * How to resolve an ambiguous bar when no finer path is available.
     *
     * Defaults to **true**: assume the stop was hit first. Assuming favourably is worth an
     * enormous amount of fictional performance — every violent bar becomes a win — and it is
     * almost never noticed, because the resulting equity curve looks merely very good rather than
     * impossible. Pessimism costs a little realism on genuine winners and cannot manufacture an
     * edge that is not there.
     */
    resolvePessimistically?: boolean;
  } = {},
): TripleBarrierLabel[] {
  const pessimistic = options.resolvePessimistically ?? true;
  const out: TripleBarrierLabel[] = [];

  const returns = logReturns(w.close);
  const { volLookback, tpMultiple, slMultiple, maxHoldingBars } = config;

  for (let i = volLookback; i < w.length - 1; i++) {
    // Volatility as known **at entry**, from bars strictly before it. Including bar i's own
    // return would size the barrier using the move the label is about to measure.
    const volWindow = returns.slice(Math.max(0, i - volLookback), i);
    if (volWindow.length < 2) continue;
    const sigma = sampleStd(volWindow);
    if (sigma === 0 || !Number.isFinite(sigma)) continue;

    const entryPrice = w.close[i];
    const upper = entryPrice * Math.exp(tpMultiple * sigma);
    const lower = entryPrice * Math.exp(-slMultiple * sigma);
    const stopDistance = entryPrice - lower;
    if (stopDistance <= 0) continue;

    const lastBar = Math.min(i + maxHoldingBars, w.length - 1);
    let label: LabelValue = 0;
    let resolvedAt = w.closeTime[lastBar];
    let exitPrice = w.close[lastBar];
    let ambiguous = false;

    for (let j = i + 1; j <= lastBar; j++) {
      const touchedUpper = w.high[j] >= upper;
      const touchedLower = w.low[j] <= lower;

      if (touchedUpper && touchedLower) {
        const finer = options.path ? resolveWithPath(options.path, w.openTime[j], w.closeTime[j], upper, lower) : null;
        if (finer !== null) {
          label = finer;
          exitPrice = finer === 1 ? upper : lower;
        } else {
          ambiguous = true;
          label = pessimistic ? -1 : 1;
          exitPrice = pessimistic ? lower : upper;
        }
        resolvedAt = w.closeTime[j];
        break;
      }
      if (touchedUpper) {
        label = 1;
        exitPrice = upper;
        resolvedAt = w.closeTime[j];
        break;
      }
      if (touchedLower) {
        label = -1;
        exitPrice = lower;
        resolvedAt = w.closeTime[j];
        break;
      }
    }

    out.push({
      index: i,
      entryTime: w.closeTime[i],
      entryPrice,
      upperBarrier: upper,
      lowerBarrier: lower,
      deadline: w.closeTime[lastBar],
      label,
      resolvedAt,
      realizedR: (exitPrice - entryPrice) / stopDistance,
      ambiguous,
    });
  }

  return out;
}

/**
 * Which barrier a bar touched first, from a finer series covering that bar.
 *
 * Returns null when the finer series does not cover the span — better to fall through to the
 * declared ambiguity policy than to guess from partial coverage.
 */
function resolveWithPath(
  path: Window,
  barOpen: number,
  barClose: number,
  upper: number,
  lower: number,
): LabelValue | null {
  let covered = false;
  for (let i = 0; i < path.length; i++) {
    if (path.openTime[i] < barOpen || path.openTime[i] >= barClose) continue;
    covered = true;
    const hitUpper = path.high[i] >= upper;
    const hitLower = path.low[i] <= lower;
    if (hitUpper && hitLower) return null; // still ambiguous at this granularity
    if (hitUpper) return 1;
    if (hitLower) return -1;
  }
  return covered ? null : null;
}

/**
 * Meta-labels: given a primary model's call, was *this instance* one worth taking (docs/18 §1.2).
 *
 * This is what makes NO TRADE a model output rather than a threshold on a confidence score. The
 * primary answers "which direction"; the meta model answers "act at all", and it is trained on
 * whether the primary's call actually resolved profitably.
 */
export interface MetaLabel {
  index: number;
  /** The primary's call at this bar. */
  side: 1 | -1;
  /** 1 if acting on it would have been right, 0 otherwise. */
  act: 0 | 1;
  realizedR: number;
  resolvedAt: number;
}

export function metaLabels(labels: TripleBarrierLabel[], sides: Array<1 | -1 | 0>): MetaLabel[] {
  const out: MetaLabel[] = [];
  for (let i = 0; i < labels.length; i++) {
    const side = sides[i];
    if (side === 0 || side === undefined) continue;
    const l = labels[i];
    // Signed by the side taken: a short that resolved at the lower barrier is a win.
    const r = side === 1 ? l.realizedR : -l.realizedR;
    out.push({
      index: l.index,
      side,
      act: r > 0 ? 1 : 0,
      realizedR: r,
      resolvedAt: l.resolvedAt,
    });
  }
  return out;
}

/**
 * Sample weights by uniqueness (docs/18 §3.1).
 *
 * Overlapping labels are **not independent observations**. A 24-bar horizon means each label
 * shares most of its outcome window with its neighbours, so a heavily-overlapped stretch of
 * history contributes the same information many times and dominates the fit. Weighting by the
 * inverse of concurrent-label count corrects for it.
 *
 * Without this, a model is effectively trained on far fewer independent samples than the row
 * count suggests, and every confidence interval derived from that row count is too narrow.
 */
export function uniquenessWeights(labels: TripleBarrierLabel[]): number[] {
  if (labels.length === 0) return [];

  // How many labels are live at each label's entry — computed over the whole set, so a label in
  // a crowded stretch is downweighted even if its own horizon is short.
  const weights: number[] = [];
  for (const l of labels) {
    let concurrent = 0;
    for (const other of labels) {
      if (other.entryTime <= l.entryTime && other.resolvedAt > l.entryTime) concurrent++;
    }
    weights.push(concurrent === 0 ? 1 : 1 / concurrent);
  }

  // Normalised to mean 1 so the effective sample size is comparable to the row count, and so a
  // change in horizon does not silently rescale every regularisation constant.
  const total = weights.reduce((a, b) => a + b, 0);
  const scale = weights.length / total;
  return weights.map((w) => w * scale);
}

/** Distribution summary — the first thing to look at before trusting any model on a label set. */
export function labelBalance(labels: TripleBarrierLabel[]): {
  total: number;
  up: number;
  down: number;
  timeout: number;
  ambiguous: number;
  meanR: number;
} {
  const up = labels.filter((l) => l.label === 1).length;
  const down = labels.filter((l) => l.label === -1).length;
  const timeout = labels.filter((l) => l.label === 0).length;
  const ambiguous = labels.filter((l) => l.ambiguous).length;
  const meanR = labels.length === 0 ? 0 : labels.reduce((a, l) => a + l.realizedR, 0) / labels.length;
  return { total: labels.length, up, down, timeout, ambiguous, meanR };
}
