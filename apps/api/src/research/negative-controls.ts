import { Split, assertNoOverlap, purgedKFold } from './splitting';
import { TimedSample } from './splitting';
import {
  DEFAULT_TRAIN_CONFIG,
  TrainConfig,
  predictProbabilities,
  rocAuc,
  trainLogistic,
} from './logistic-regression';

export interface Dataset {
  featureNames: string[];
  /** One row per sample, columns in `featureNames` order. Nulls are permitted and meaningful. */
  X: Array<Array<number | null>>;
  /** Binary target. */
  y: number[];
  /** Per-sample weights (uniqueness). */
  weights: number[];
  samples: TimedSample[];
}

export interface ControlResult {
  name: string;
  /** What the control asserts must be true. Stated so a failure explains itself. */
  expectation: string;
  baselineAuc: number | null;
  controlAuc: number | null;
  passed: boolean;
  detail: string;
  /**
   * For the permutation control: the fraction of null draws that matched or beat the baseline.
   * This is the actual p-value, and it is what should be quoted rather than a single AUC.
   */
  pValue?: number;
  /** Every null draw, so the distribution can be inspected rather than summarised away. */
  nullDistribution?: number[];
}

export interface ControlSuiteResult {
  baselineAuc: number | null;
  controls: ControlResult[];
  allPassed: boolean;
}

/**
 * The negative controls (docs/18 §3.4).
 *
 * These do not measure how good a strategy is. They measure whether the **harness** is telling
 * the truth, and they are the first thing to run — a promising result from a leaking pipeline is
 * worse than no result, because somebody will act on it.
 *
 * The shifted-feature control deserves its reputation: it is the cheapest, most reliable leak
 * detector available and almost nobody runs it. If moving every feature one bar into the future
 * does *not* improve performance, the features already contain the future and the pipeline is
 * broken somewhere upstream of the model.
 */
export class NegativeControls {
  constructor(
    private readonly folds = 5,
    private readonly config: TrainConfig = DEFAULT_TRAIN_CONFIG,
    /** Null draws for the permutation test. More is tighter; each costs a full CV pass. */
    private readonly permutations = 10,
  ) {}

  /**
   * Trains and scores under purged, embargoed cross-validation.
   *
   * Returns the mean out-of-fold AUC. Deliberately not accuracy: on a 55/45 label set accuracy
   * mostly reports the base rate, and a model that predicts the majority class everywhere scores
   * well on it.
   */
  crossValidatedAuc(
    data: Dataset,
    splits?: Split[],
    options: {
      /**
       * Skip the overlap assertion.
       *
       * Exists for exactly one caller: the test that demonstrates what a *leaking* split scores,
       * so the argument for purging is a number rather than a claim. Named to be unusable by
       * accident and never set anywhere in production code.
       */
      allowLeakingSplitsForDemonstration?: boolean;
    } = {},
  ): { auc: number | null; foldAucs: number[] } {
    const useSplits = splits ?? purgedKFold(data.samples, this.folds);
    const foldAucs: number[] = [];

    for (const split of useSplits) {
      if (split.trainIndices.length < 20 || split.testIndices.length < 10) continue;

      // Assert rather than trust. A leak that survives into research is expensive, and the check
      // is nearly free.
      const overlap = options.allowLeakingSplitsForDemonstration
        ? { clean: true, offenders: [] }
        : assertNoOverlap(data.samples, split);
      if (!overlap.clean) {
        throw new Error(
          `Split leaks: ${overlap.offenders.length} training sample(s) overlap the test block.`,
        );
      }

      const trainX = split.trainIndices.map((i) => data.X[i]);
      const trainY = split.trainIndices.map((i) => data.y[i]);
      const trainW = split.trainIndices.map((i) => data.weights[i]);

      // Nothing to learn from a single-class fold, and AUC is undefined on one.
      if (new Set(trainY).size < 2) continue;

      const model = trainLogistic(trainX, trainY, data.featureNames, trainW, this.config);

      const testX = split.testIndices.map((i) => data.X[i]);
      const testY = split.testIndices.map((i) => data.y[i]);
      if (new Set(testY).size < 2) continue;

      const auc = rocAuc(testY, predictProbabilities(model, testX));
      if (auc !== null) foldAucs.push(auc);
    }

    if (foldAucs.length === 0) return { auc: null, foldAucs };
    return { auc: foldAucs.reduce((a, b) => a + b, 0) / foldAucs.length, foldAucs };
  }

  /**
   * Runs every control and reports each independently.
   *
   * A single failure blocks promotion. There is no aggregate score and no "three out of four" —
   * each control tests a different way for the pipeline to be lying, and passing the other three
   * says nothing about the one that failed.
   */
  run(data: Dataset, seed = 20260815): ControlSuiteResult {
    const baseline = this.crossValidatedAuc(data);
    const controls: ControlResult[] = [];

    controls.push(this.shuffledLabels(data, baseline.auc, seed));
    controls.push(this.shiftedFeatures(data, baseline.auc));
    controls.push(this.randomFeatures(data, baseline.auc, seed));
    controls.push(this.constantFeatures(data, baseline.auc));

    return {
      baselineAuc: baseline.auc,
      controls,
      allPassed: controls.every((c) => c.passed),
    };
  }

  /**
   * **Shuffled labels must destroy performance.**
   *
   * With the target permuted there is nothing to learn, so any remaining signal is the pipeline
   * leaking structure through some other channel — a fold boundary, an index misalignment, a
   * standardisation computed over the whole set.
   *
   * The permutation is *block-wise* rather than uniform, which is a stricter test: it preserves
   * the label's serial correlation, so a model cannot score by exploiting autocorrelation that a
   * uniform shuffle would have destroyed along with the signal.
   */
  private shuffledLabels(data: Dataset, baselineAuc: number | null, seed: number): ControlResult {
    // A **permutation test**, not a single shuffle.
    //
    // One permuted run is a sample of size one from the null distribution, and comparing it to a
    // fixed threshold is not a test — on a few hundred heavily-overlapping labels the standard
    // error of AUC is easily 0.05, so a single draw at 0.42 is unremarkable noise while looking
    // exactly like a failure. Averaging over several draws tightens the estimate by √n, and the
    // fraction of draws that reach the baseline is the p-value the result should actually be
    // quoted with. Learned by watching a single-draw version fail on a dataset with no leak.
    const draws: number[] = [];
    for (let r = 0; r < this.permutations; r++) {
      const { auc } = this.crossValidatedAuc({ ...data, y: blockPermute(data.y, 20, seed + r * 7919) });
      if (auc !== null) draws.push(auc);
    }

    if (draws.length === 0) {
      return {
        name: 'shuffled-labels',
        expectation: 'AUC collapses to ~0.5 under permutation.',
        baselineAuc,
        controlAuc: null,
        passed: false,
        detail: 'No permutation produced a scoreable fold.',
      };
    }

    const nullMean = draws.reduce((a, b) => a + b, 0) / draws.length;
    const pValue =
      baselineAuc === null ? 1 : draws.filter((d) => d >= baselineAuc).length / draws.length;

    // The mean of several draws is far tighter than any one of them, so the band can be narrow
    // without being flaky.
    const passed = Math.abs(nullMean - 0.5) < 0.05;

    return {
      name: 'shuffled-labels',
      expectation:
        'The permuted-label AUC distribution centres on 0.5. Anything else means the pipeline leaks.',
      baselineAuc,
      controlAuc: nullMean,
      passed,
      detail: passed
        ? `${draws.length} permutations centre on ${fmt(nullMean)} — chance, as they must. ` +
          `p = ${pValue.toFixed(3)} against the baseline.`
        : `${draws.length} permutations centre on ${fmt(nullMean)}, away from 0.5. There is nothing ` +
          'to learn from permuted labels, so this is a leak.',
      pValue,
      nullDistribution: draws,
    };
  }

  /**
   * **Features shifted one bar into the future must IMPROVE performance.**
   *
   * The cheapest leak detector there is, and the one almost nobody runs. Handing the model
   * tomorrow's features for today's label is cheating, so it should score better. If it does not
   * — if performance is flat or worse — the features already contain the future and the pipeline
   * is broken upstream of the model.
   *
   * A flat result here alongside a good baseline is the signature of a lookahead bug, and it is
   * the single most valuable thing this suite can tell you.
   */
  private shiftedFeatures(data: Dataset, baselineAuc: number | null): ControlResult {
    const n = data.X.length;
    if (n < 30 || baselineAuc === null) {
      return {
        name: 'shifted-features',
        expectation: 'Feeding future features must improve AUC.',
        baselineAuc,
        controlAuc: null,
        passed: false,
        detail: 'Not enough samples, or no baseline, to run the control.',
      };
    }

    // Row i gets row i+1's features against row i's label. The last row is dropped rather than
    // padded — padding would introduce a synthetic row the control then measures.
    const shifted: Dataset = {
      ...data,
      X: data.X.slice(1),
      y: data.y.slice(0, -1),
      weights: data.weights.slice(0, -1),
      samples: data.samples.slice(0, -1),
    };
    const { auc } = this.crossValidatedAuc(shifted);

    const passed = auc !== null && auc > baselineAuc;
    return {
      name: 'shifted-features',
      expectation: 'AUC rises when the model is handed the next bar. It is cheating; it should win.',
      baselineAuc,
      controlAuc: auc,
      passed,
      detail: passed
        ? `AUC ${fmt(auc)} vs baseline ${fmt(baselineAuc)} — cheating helps, so the honest path is not already cheating.`
        : `AUC ${fmt(auc)} did not beat the baseline ${fmt(baselineAuc)}. Future information adds nothing, ` +
          'which means the features already contain it. This is a lookahead leak upstream of the model.',
    };
  }

  /** Pure noise features must score at chance. Catches an evaluation that rewards overfitting. */
  private randomFeatures(data: Dataset, baselineAuc: number | null, seed: number): ControlResult {
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648 - 0.5;
    };
    const noise: Dataset = {
      ...data,
      featureNames: data.featureNames.map((_, i) => `noise_${i}`),
      X: data.X.map((row) => row.map(() => rand())),
    };
    const { auc } = this.crossValidatedAuc(noise);

    const passed = auc === null || Math.abs(auc - 0.5) < 0.1;
    return {
      name: 'random-features',
      expectation: 'Noise inputs score at chance.',
      baselineAuc,
      controlAuc: auc,
      passed,
      detail: passed
        ? `AUC ${fmt(auc)} on pure noise — the evaluation is not rewarding memorisation.`
        : `AUC ${fmt(auc)} on pure noise. The evaluation itself is leaking or overfitting.`,
    };
  }

  /** Constant features carry no information; AUC must be exactly undefined or chance. */
  private constantFeatures(data: Dataset, baselineAuc: number | null): ControlResult {
    const constant: Dataset = { ...data, X: data.X.map((row) => row.map(() => 1)) };
    const { auc } = this.crossValidatedAuc(constant);

    const passed = auc === null || Math.abs(auc - 0.5) < 0.02;
    return {
      name: 'constant-features',
      expectation: 'A model with no varying input cannot rank anything.',
      baselineAuc,
      controlAuc: auc,
      passed,
      detail: passed
        ? `AUC ${fmt(auc)} — no input variation, no ranking, as expected.`
        : `AUC ${fmt(auc)} from constant inputs, which is impossible without a bug in the evaluation.`,
    };
  }
}

/**
 * Permutes in contiguous blocks, preserving serial correlation within each block.
 *
 * Stricter than a uniform shuffle: a uniform permutation destroys the label's autocorrelation
 * along with its signal, so a model that was exploiting autocorrelation would appear to have been
 * exploiting signal. Block permutation leaves that structure intact and removes only the
 * alignment with the features.
 */
export function blockPermute<T>(values: T[], blockSize: number, seed: number): T[] {
  const blocks: T[][] = [];
  for (let i = 0; i < values.length; i += blockSize) blocks.push(values.slice(i, i + blockSize));

  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  return blocks.flat().slice(0, values.length);
}

function fmt(v: number | null): string {
  return v === null ? 'n/a' : v.toFixed(4);
}
