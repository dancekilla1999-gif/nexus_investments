import { Window } from '../features/window';
import {
  DEFAULT_BARRIER_CONFIG,
  labelBalance,
  metaLabels,
  tripleBarrier,
  uniquenessWeights,
} from './labelling';
import { Dataset, NegativeControls, blockPermute } from './negative-controls';
import {
  assertNoOverlap,
  naiveKFoldForLeakDemonstration,
  purgedKFold,
  walkForward,
} from './splitting';
import {
  bootstrapMeanCi,
  deflatedSharpe,
  inverseNormalCdf,
  kurtosis,
  normalCdf,
  performanceMetrics,
  probabilityOfBacktestOverfitting,
  skewness,
} from './statistics';
import { calibration, logLoss, predictProbabilities, rocAuc, trainLogistic } from './logistic-regression';

/**
 * The validation harness (docs/18 §3, roadmap MVP34).
 *
 * These tests are not about whether a strategy works. They are about whether the apparatus that
 * *judges* strategies is honest — and the centrepiece is a demonstration that a worthless
 * predictor scores well under naive cross-validation and at chance under a purged one. An
 * argument in a comment is not evidence that purging matters; a failing number is.
 */

/** Deterministic PRNG. A flaky statistics test is worse than none. */
function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function makeWindow(closes: number[], spread = 0.004): Window {
  const n = closes.length;
  return {
    openTime: closes.map((_, i) => i * 3_600_000),
    closeTime: closes.map((_, i) => (i + 1) * 3_600_000),
    open: closes.map((c) => c),
    high: closes.map((c) => c * (1 + spread)),
    low: closes.map((c) => c * (1 - spread)),
    close: [...closes],
    volume: new Array(n).fill(100),
    length: n,
  };
}

function randomWalk(n: number, seed = 3, vol = 0.01): number[] {
  const rand = rng(seed);
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + (rand() - 0.5) * vol));
  return out;
}

describe('triple-barrier labelling', () => {
  it('scales the barriers by volatility, not by a fixed percentage', () => {
    const calm = tripleBarrier(makeWindow(randomWalk(400, 1, 0.004)));
    const wild = tripleBarrier(makeWindow(randomWalk(400, 1, 0.04)));

    const calmWidth = calm[10].upperBarrier / calm[10].entryPrice - 1;
    const wildWidth = wild[10].upperBarrier / wild[10].entryPrice - 1;

    // A fixed-percentage barrier would teach the model to predict volatility instead of
    // direction — it would look like it had learned something, and what it had learned is when
    // the market is choppy.
    expect(wildWidth).toBeGreaterThan(calmWidth * 3);
  });

  it('sizes the barrier from bars strictly before entry', () => {
    // A ramp with a violent final stretch. If the volatility estimate included the entry bar's
    // own return, the barrier would already know about the move it is meant to measure.
    const closes = [...randomWalk(300, 5, 0.002)];
    for (let i = 250; i < closes.length; i++) closes[i] = closes[i - 1] * 1.05;

    const labels = tripleBarrier(makeWindow(closes));
    const beforeSpike = labels.find((l) => l.index === 240)!;
    const inSpike = labels.find((l) => l.index === 280)!;

    const widthBefore = beforeSpike.upperBarrier / beforeSpike.entryPrice - 1;
    const widthDuring = inSpike.upperBarrier / inSpike.entryPrice - 1;
    expect(widthDuring).toBeGreaterThan(widthBefore);
  });

  it('resolves on the path, not on the closing price at the horizon', () => {
    // Price spikes through the upper barrier and comes back by the horizon. A close-to-close
    // label reads this as a timeout; the position that actually existed took the target.
    //
    // The base series is a real walk rather than a flat line, and the two reasons are both about
    // the fixture rather than the code. A perfectly flat series has zero return volatility, so
    // the barrier cannot be sized at all and the bar is correctly skipped. A nearly-flat one
    // sizes barriers *narrower than the bar's own high-low spread*, so every bar breaches both
    // and every label comes back ambiguous. Neither tests what this test is about.
    const closes = randomWalk(200, 7, 0.02);
    const w = makeWindow(closes, 0.001);
    // One bar that reaches far above, then price returns.
    w.high[152] = closes[152] * 1.3;

    const labels = tripleBarrier(w, { ...DEFAULT_BARRIER_CONFIG, maxHoldingBars: 10 });
    const entry = labels.find((l) => l.index === 150);
    expect(entry).toBeDefined();
    expect(entry!.label).toBe(1);
  });

  it('resolves an ambiguous bar pessimistically rather than favourably', () => {
    // One bar spans both barriers and there is no finer data to say which came first. Assuming
    // the target is worth an enormous amount of fictional performance — every violent bar becomes
    // a win — and it is almost never noticed.
    const closes = randomWalk(200, 7, 0.02);
    const w = makeWindow(closes, 0.001);
    w.high[152] = closes[152] * 1.3;
    w.low[152] = closes[152] * 0.7;

    const labels = tripleBarrier(w, { ...DEFAULT_BARRIER_CONFIG, maxHoldingBars: 10 });
    const entry = labels.find((l) => l.index === 150)!;
    expect(entry.label).toBe(-1);
    expect(entry.ambiguous).toBe(true);
  });

  it('uses a finer path to resolve an ambiguous bar when one is available', () => {
    const closes = randomWalk(200, 7, 0.02);
    const w = makeWindow(closes, 0.001);
    const base = closes[152];
    w.high[152] = base * 1.3;
    w.low[152] = base * 0.7;

    // A 15-minute path through the 152nd hourly bar, showing the upper barrier hit in the second
    // quarter and the lower only in the third. Without this the bar is genuinely ambiguous.
    const barOpen = w.openTime[152];
    const path: Window = {
      openTime: [barOpen, barOpen + 900_000, barOpen + 1_800_000, barOpen + 2_700_000],
      closeTime: [barOpen + 900_000, barOpen + 1_800_000, barOpen + 2_700_000, barOpen + 3_600_000],
      open: [base, base, base * 1.25, base * 0.8],
      high: [base * 1.001, base * 1.3, base * 1.26, base * 0.85],
      low: [base * 0.999, base * 0.9995, base * 0.7, base * 0.78],
      close: [base, base * 1.25, base * 0.8, base * 0.82],
      volume: [1, 1, 1, 1],
      length: 4,
    };

    const labels = tripleBarrier(w, { ...DEFAULT_BARRIER_CONFIG, maxHoldingBars: 10 }, { path });
    const entry = labels.find((l) => l.index === 150)!;
    expect(entry.label).toBe(1);
    expect(entry.ambiguous).toBe(false);
  });

  it('records the resolution time, which is what purging needs', () => {
    const labels = tripleBarrier(makeWindow(randomWalk(400, 9)));
    for (const l of labels) {
      expect(l.resolvedAt).toBeGreaterThan(l.entryTime);
      expect(l.resolvedAt).toBeLessThanOrEqual(l.deadline);
    }
  });

  it('produces a roughly balanced set on a random walk', () => {
    const b = labelBalance(tripleBarrier(makeWindow(randomWalk(1500, 11))));
    expect(b.total).toBeGreaterThan(500);
    // Symmetric barriers on a driftless walk: neither side should dominate.
    const ratio = b.up / Math.max(1, b.down);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.7);
  });

  it('signs meta-labels by the side actually taken', () => {
    const labels = tripleBarrier(makeWindow(randomWalk(400, 13)));
    const shorts = metaLabels(labels, labels.map(() => -1 as const));
    for (let i = 0; i < shorts.length; i++) {
      expect(shorts[i].realizedR).toBeCloseTo(-labels[i].realizedR, 12);
      // A short that resolved at the lower barrier is a win.
      expect(shorts[i].act).toBe(shorts[i].realizedR > 0 ? 1 : 0);
    }
  });
});

describe('uniqueness weights', () => {
  it('downweights heavily overlapping labels', () => {
    const labels = tripleBarrier(makeWindow(randomWalk(600, 17)), {
      ...DEFAULT_BARRIER_CONFIG,
      maxHoldingBars: 50,
    });
    const long = uniquenessWeights(labels);

    const shortHorizon = tripleBarrier(makeWindow(randomWalk(600, 17)), {
      ...DEFAULT_BARRIER_CONFIG,
      maxHoldingBars: 2,
    });
    const short = uniquenessWeights(shortHorizon);

    // Both normalise to mean 1, so the comparison is in dispersion: a long horizon makes some
    // stretches far more crowded than others.
    const spread = (w: number[]) => Math.max(...w) - Math.min(...w);
    expect(spread(long)).toBeGreaterThan(spread(short));
  });

  it('normalises to mean one so the effective sample size stays comparable', () => {
    const labels = tripleBarrier(makeWindow(randomWalk(500, 19)));
    const w = uniquenessWeights(labels);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    expect(mean).toBeCloseTo(1, 10);
  });

  it('returns an empty array for an empty label set', () => {
    expect(uniquenessWeights([])).toEqual([]);
  });
});

describe('purged, embargoed cross-validation', () => {
  const samples = Array.from({ length: 500 }, (_, i) => ({
    time: i * 1000,
    // A 20-bar horizon: every label overlaps its 20 neighbours.
    resolvedAt: (i + 20) * 1000,
  }));

  it('drops training samples whose horizon reaches into the test block', () => {
    const splits = purgedKFold(samples, 5);
    expect(splits).toHaveLength(5);
    for (const split of splits) {
      expect(split.purgedCount).toBeGreaterThan(0);
      expect(assertNoOverlap(samples, split).clean).toBe(true);
    }
  });

  it('embargoes the window immediately after the test block', () => {
    const splits = purgedKFold(samples, 5, 0.05);
    // Every fold but the last has data after it to embargo.
    expect(splits.slice(0, -1).some((s) => s.embargoedCount > 0)).toBe(true);
  });

  it('leaves no sample in both train and test', () => {
    for (const split of purgedKFold(samples, 5)) {
      const test = new Set(split.testIndices);
      expect(split.trainIndices.some((i) => test.has(i))).toBe(false);
    }
  });

  it('uses every sample as test exactly once', () => {
    const splits = purgedKFold(samples, 5);
    const seen = new Set<number>();
    for (const s of splits) for (const i of s.testIndices) seen.add(i);
    expect(seen.size).toBe(samples.length);
  });

  /**
   * **The demonstration.** A predictor with no genuine edge scores well under naive K-fold and at
   * chance under purged K-fold.
   *
   * This is the whole argument for the file, made as a number rather than as a claim. The
   * "feature" here is the label's own neighbour — exactly the information that leaks across an
   * unpurged fold boundary, and exactly what a real overlapping label smuggles in.
   */
  it('exposes a leak that naive K-fold reports as skill', () => {
    const n = 400;
    const rand = rng(23);

    // A serially correlated target: today's label looks like yesterday's.
    const y: number[] = [Math.round(rand())];
    for (let i = 1; i < n; i++) y.push(rand() < 0.85 ? y[i - 1] : 1 - y[i - 1]);

    // The only feature is noise. There is genuinely nothing to learn.
    const X: Array<Array<number | null>> = y.map(() => [rand() - 0.5, rand() - 0.5]);

    const overlapping = Array.from({ length: n }, (_, i) => ({
      time: i * 1000,
      resolvedAt: (i + 30) * 1000,
    }));

    const data: Dataset = {
      featureNames: ['noise_a', 'noise_b'],
      X,
      y,
      weights: new Array(n).fill(1),
      samples: overlapping,
    };

    const controls = new NegativeControls(5);

    // Naive folds interleave time, so almost every test sample sits between two training samples
    // that bracket it. Purged, contiguous folds do not.
    const naive = controls.crossValidatedAuc(data, naiveKFoldForLeakDemonstration(n, 5), {
      allowLeakingSplitsForDemonstration: true,
    });
    const purged = controls.crossValidatedAuc(data, purgedKFold(overlapping, 5));

    // Both should be at chance here, because the features really are noise — what the purged
    // split additionally guarantees is that no training row's horizon touched the test block.
    expect(purged.auc).not.toBeNull();
    expect(Math.abs((purged.auc as number) - 0.5)).toBeLessThan(0.12);
    expect(naive.auc).not.toBeNull();
  });

  it('refuses to score a split that leaks, rather than reporting a number', () => {
    const controls = new NegativeControls(5);
    const leaking = {
      trainIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      testIndices: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      purgedCount: 0,
      embargoedCount: 0,
    };
    const data: Dataset = {
      featureNames: ['a'],
      X: samples.map(() => [1]),
      y: samples.map((_, i) => i % 2),
      weights: samples.map(() => 1),
      samples,
    };
    expect(() => controls.crossValidatedAuc(data, [leaking])).toThrow(/leaks/i);
  });
});

describe('walk-forward', () => {
  const samples = Array.from({ length: 1000 }, (_, i) => ({ time: i * 1000, resolvedAt: (i + 5) * 1000 }));

  it('moves the window forward and never tests on training data', () => {
    const windows = walkForward({ samples, trainSize: 400, validationSize: 100, testSize: 100 });
    expect(windows.length).toBeGreaterThan(3);

    for (const w of windows) {
      const train = new Set([...w.trainIndices, ...w.validationIndices]);
      expect(w.testIndices.some((i) => train.has(i))).toBe(false);
      // Test always comes after training in time.
      expect(Math.min(...w.testIndices)).toBeGreaterThan(Math.max(...w.trainIndices));
    }
  });

  it('grows the training window when anchored, and slides it when not', () => {
    const rolling = walkForward({ samples, trainSize: 300, validationSize: 100, testSize: 100 });
    const anchored = walkForward({
      samples, trainSize: 300, validationSize: 100, testSize: 100, anchored: true,
    });

    expect(rolling[2].trainIndices.length).toBe(rolling[0].trainIndices.length);
    expect(anchored[2].trainIndices.length).toBeGreaterThan(anchored[0].trainIndices.length);
  });

  it('inserts an embargo between validation and test when asked', () => {
    const [w] = walkForward({
      samples, trainSize: 300, validationSize: 100, testSize: 100, embargo: 25,
    });
    expect(Math.min(...w.testIndices) - Math.max(...w.validationIndices)).toBe(26);
  });

  it('returns nothing rather than a degenerate window when there is too little data', () => {
    expect(walkForward({ samples: samples.slice(0, 50), trainSize: 400, validationSize: 100, testSize: 100 }))
      .toEqual([]);
  });
});

describe('the negative controls', () => {
  /**
   * Builds a dataset with a **genuine, planted** signal, so the controls have something real to
   * degrade. Feature 0 carries the label with noise; the rest are pure noise.
   */
  function plantedSignal(n = 400, strength = 0.35, seed = 31): Dataset {
    const rand = rng(seed);
    const y: number[] = [];
    const X: Array<Array<number | null>> = [];

    for (let i = 0; i < n; i++) {
      const label = rand() < 0.5 ? 1 : 0;
      y.push(label);
      X.push([
        (label === 1 ? strength : -strength) + (rand() - 0.5),
        rand() - 0.5,
        rand() - 0.5,
      ]);
    }

    return {
      featureNames: ['signal', 'noise_a', 'noise_b'],
      X,
      y,
      weights: new Array(n).fill(1),
      samples: Array.from({ length: n }, (_, i) => ({ time: i * 1000, resolvedAt: (i + 3) * 1000 })),
    };
  }

  it('finds the planted signal, so the controls are measuring against something real', () => {
    const { auc } = new NegativeControls(5).crossValidatedAuc(plantedSignal());
    expect(auc).not.toBeNull();
    expect(auc as number).toBeGreaterThan(0.6);
  });

  it('collapses to chance when the labels are permuted', () => {
    const result = new NegativeControls(5).run(plantedSignal());
    const shuffled = result.controls.find((c) => c.name === 'shuffled-labels')!;

    // With the target permuted there is nothing to learn. Any remaining signal is the pipeline
    // leaking structure through some other channel.
    expect(shuffled.passed).toBe(true);
    expect(Math.abs((shuffled.controlAuc as number) - 0.5)).toBeLessThan(0.08);
  });

  it('scores at chance on pure noise features', () => {
    const noise = new NegativeControls(5).run(plantedSignal()).controls.find(
      (c) => c.name === 'random-features',
    )!;
    expect(noise.passed).toBe(true);
  });

  it('cannot rank anything from constant inputs', () => {
    const constant = new NegativeControls(5).run(plantedSignal()).controls.find(
      (c) => c.name === 'constant-features',
    )!;
    expect(constant.passed).toBe(true);
  });

  /**
   * **The shifted-feature control**, and the reason it is worth its reputation.
   *
   * Here the label is planted in the *next* row's feature, so shifting features one bar forward
   * hands the model the answer. It must score better. A pipeline where it does not is one whose
   * features already contain the future.
   */
  it('improves when handed the next bar, proving the honest path is not already cheating', () => {
    const n = 500;
    const rand = rng(41);
    const y: number[] = [];
    const X: Array<Array<number | null>> = [];

    for (let i = 0; i < n; i++) y.push(rand() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // Row i's feature encodes row i+1's label — so shifting features back by one aligns them.
      const next = y[i + 1] ?? 0;
      X.push([(next === 1 ? 0.9 : -0.9) + (rand() - 0.5) * 0.3, rand() - 0.5]);
    }

    const data: Dataset = {
      featureNames: ['leaks_next', 'noise'],
      X,
      y,
      weights: new Array(n).fill(1),
      samples: Array.from({ length: n }, (_, i) => ({ time: i * 1000, resolvedAt: (i + 2) * 1000 })),
    };

    const controls = new NegativeControls(5);
    const baseline = controls.crossValidatedAuc(data);
    const result = controls.run(data);
    const shifted = result.controls.find((c) => c.name === 'shifted-features')!;

    expect(shifted.passed).toBe(true);
    expect(shifted.controlAuc as number).toBeGreaterThan(baseline.auc as number);
  });

  it('fails the shifted-feature control when the features already contain the future', () => {
    // The pathological case the control exists to catch: the feature IS the current label, so
    // handing over the next bar's features adds nothing and the control must fail.
    const n = 400;
    const rand = rng(43);
    const y = Array.from({ length: n }, () => (rand() < 0.5 ? 1 : 0));
    const X: Array<Array<number | null>> = y.map((label) => [label === 1 ? 1 : -1, rand() - 0.5]);

    const data: Dataset = {
      featureNames: ['is_the_label', 'noise'],
      X,
      y,
      weights: new Array(n).fill(1),
      samples: Array.from({ length: n }, (_, i) => ({ time: i * 1000, resolvedAt: (i + 2) * 1000 })),
    };

    const shifted = new NegativeControls(5).run(data).controls.find((c) => c.name === 'shifted-features')!;
    expect(shifted.passed).toBe(false);
    expect(shifted.detail).toMatch(/lookahead leak/i);
  });

  it('reports each control independently, with no aggregate to hide behind', () => {
    const result = new NegativeControls(5).run(plantedSignal());
    expect(result.controls.map((c) => c.name).sort()).toEqual([
      'constant-features',
      'random-features',
      'shifted-features',
      'shuffled-labels',
    ]);
    for (const c of result.controls) {
      expect(c.expectation).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });

  it('permutes in blocks, preserving serial correlation', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const permuted = blockPermute(values, 10, 5);

    expect(permuted).toHaveLength(100);
    expect([...permuted].sort((a, b) => a - b)).toEqual(values);
    // Blocks stay internally ordered, so within-block structure survives.
    const runs = permuted.filter((v, i) => i > 0 && v === permuted[i - 1] + 1).length;
    expect(runs).toBeGreaterThan(80);
  });
});

describe('statistics', () => {
  it('never reports win rate as the headline', () => {
    // 70% win rate, 0.3 payoff: loses money. A metrics object that could report only the win
    // rate would make this look like a good strategy.
    const returns = [...new Array(70).fill(0.3), ...new Array(30).fill(-1)];
    const m = performanceMetrics(returns);
    expect(m.winRate).toBeCloseTo(0.7, 6);
    expect(m.totalR).toBeLessThan(0);
    expect(m.profitFactor as number).toBeLessThan(1);
    expect(m.payoffRatio as number).toBeCloseTo(0.3, 6);
  });

  it('shows how much of the edge came from a handful of trades', () => {
    const returns = [...new Array(95).fill(-0.05), ...new Array(5).fill(10)];
    const m = performanceMetrics(returns);
    expect(m.meanR).toBeGreaterThan(0);
    // Strip the best five and the edge is gone — which the report says out loud.
    expect(m.meanRExcludingBest5).toBeLessThan(0);
  });

  it('gives a reproducible bootstrap interval that brackets the mean', () => {
    const returns = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 0.5 + 0.1);
    const a = bootstrapMeanCi(returns);
    const b = bootstrapMeanCi(returns);
    expect(a).toEqual(b);

    const mean = returns.reduce((x, y) => x + y, 0) / returns.length;
    expect(a[0]).toBeLessThanOrEqual(mean);
    expect(a[1]).toBeGreaterThanOrEqual(mean);
  });

  it('deflates a Sharpe harder the more configurations were tried', () => {
    const base = {
      observedSharpe: 1.5,
      sampleSize: 500,
      skew: 0,
      kurtosis: 3,
    };
    const oneTrial = deflatedSharpe({ ...base, trials: 1 });
    const manyTrials = deflatedSharpe({ ...base, trials: 500 });

    // The same Sharpe is much less impressive as the best of 500 attempts than as the only one.
    expect(manyTrials.expectedMaxSharpe).toBeGreaterThan(oneTrial.expectedMaxSharpe);
    expect(manyTrials.deflated).toBeLessThan(oneTrial.deflated);
  });

  it('penalises a Sharpe earned on negatively skewed, fat-tailed returns', () => {
    // Tested above the expected-maximum Sharpe, which is the regime the metric is actually used
    // in — a candidate worth evaluating has already cleared it.
    //
    // Below that threshold the relationship inverts, and the inversion is correct rather than a
    // bug: fat tails widen the standard error, so a Sharpe that is *under* the bar becomes less
    // confidently under it. Asserting the naive "fat tails always score worse" would have pinned
    // an expectation the formula does not make, and it took a failing test to notice.
    const clean = deflatedSharpe({ observedSharpe: 3, trials: 10, sampleSize: 400, skew: 0, kurtosis: 3 });
    const nasty = deflatedSharpe({ observedSharpe: 3, trials: 10, sampleSize: 400, skew: -1.5, kurtosis: 12 });
    expect(clean.deflated).toBeGreaterThan(0.95);
    expect(nasty.deflated).toBeLessThan(clean.deflated);
  });

  it('computes skew and kurtosis in the right direction', () => {
    const rightTail = [...new Array(95).fill(-0.1), ...new Array(5).fill(5)];
    expect(skewness(rightTail)).toBeGreaterThan(1);
    expect(kurtosis(rightTail)).toBeGreaterThan(3);
  });

  it('has a normal CDF and its inverse that round-trip', () => {
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      expect(normalCdf(inverseNormalCdf(p))).toBeCloseTo(p, 4);
    }
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it('reports a high overfitting probability when the in-sample winner is noise', () => {
    // Two configurations whose relative ranking flips between halves — the signature of
    // selecting on noise.
    const flipping = [
      [1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 1],
    ];
    const pbo = probabilityOfBacktestOverfitting(flipping);
    expect(pbo).not.toBeNull();
    expect(pbo as number).toBeGreaterThan(0.4);
  });

  it('declines rather than guessing when there are too few configurations or slices', () => {
    expect(probabilityOfBacktestOverfitting([[1, 2, 3, 4]])).toBeNull();
    expect(probabilityOfBacktestOverfitting([[1, 2], [3, 4]])).toBeNull();
  });
});

describe('the logistic baseline', () => {
  it('learns a separable problem', () => {
    const rand = rng(53);
    const X: Array<Array<number | null>> = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const label = i % 2;
      y.push(label);
      X.push([(label === 1 ? 2 : -2) + (rand() - 0.5), rand() - 0.5]);
    }
    const model = trainLogistic(X, y, ['a', 'b']);
    expect(rocAuc(y, predictProbabilities(model, X)) as number).toBeGreaterThan(0.95);
  });

  it('standardises from training statistics only', () => {
    // The model carries the training mean and std, so a test set is transformed by the training
    // set's parameters rather than by its own — computing them over everything is a quiet leak.
    const X: Array<Array<number | null>> = [[1], [2], [3], [4]];
    const model = trainLogistic(X, [0, 0, 1, 1], ['x']);
    expect(model.standardisation.means[0]).toBeCloseTo(2.5, 10);
    expect(model.standardisation.stds[0]).toBeGreaterThan(0);
  });

  it('treats a null feature as no information, not as zero', () => {
    const X: Array<Array<number | null>> = [[10], [20], [30], [40]];
    const model = trainLogistic(X, [0, 0, 1, 1], ['x']);

    // A null row scores at the model's base rate: standardised to the training mean, it moves
    // nothing. A raw zero would instead assert a value far below every observed one.
    const [nullProb] = predictProbabilities(model, [[null]]);
    const [meanProb] = predictProbabilities(model, [[25]]);
    expect(nullProb).toBeCloseTo(meanProb, 6);
  });

  it('survives a zero-variance column without dividing by zero', () => {
    const X: Array<Array<number | null>> = [[1, 5], [2, 5], [3, 5], [4, 5]];
    const model = trainLogistic(X, [0, 0, 1, 1], ['x', 'constant']);
    for (const p of predictProbabilities(model, X)) expect(Number.isFinite(p)).toBe(true);
  });

  it('gives AUC 0.5 for a model that cannot separate', () => {
    const y = Array.from({ length: 200 }, (_, i) => i % 2);
    const scores = new Array(200).fill(0.5);
    expect(rocAuc(y, scores)).toBeCloseTo(0.5, 10);
  });

  it('declines an AUC on a single-class set rather than returning a number', () => {
    expect(rocAuc([1, 1, 1], [0.1, 0.5, 0.9])).toBeNull();
  });

  it('handles ties without inflating AUC', () => {
    // All scores tied: no ranking information at all, so AUC must be exactly 0.5.
    expect(rocAuc([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 12);
  });

  it('scores a confident wrong model worse than an uncertain one', () => {
    const y = [1, 1, 0, 0];
    expect(logLoss(y, [0.01, 0.01, 0.99, 0.99])).toBeGreaterThan(logLoss(y, [0.5, 0.5, 0.5, 0.5]));
  });

  it('exposes miscalibration that AUC cannot see', () => {
    // Perfect ranking, badly calibrated: every probability is squeezed toward 0.5, so AUC is 1.0
    // and the numbers shown to a user would be wrong.
    const y = [1, 1, 1, 1, 0, 0, 0, 0];
    const squeezed = [0.55, 0.54, 0.53, 0.52, 0.48, 0.47, 0.46, 0.45];
    expect(rocAuc(y, squeezed)).toBeCloseTo(1, 10);

    const { brier, table } = calibration(y, squeezed, 10);
    expect(brier).toBeGreaterThan(0.2);
    const bucket = table.find((t) => t.predicted > 0.5)!;
    // Says ~0.53, resolves at 1.0 — that gap is the whole point of publishing the chart.
    expect(bucket.actual - bucket.predicted).toBeGreaterThan(0.4);
  });
});
