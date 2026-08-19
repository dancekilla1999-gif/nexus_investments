/**
 * Cross-validation and walk-forward splitting for overlapping financial labels (docs/18 §3.1–3.2).
 *
 * The reason this file is not three lines of `sklearn.KFold`: a triple-barrier label at time `t`
 * resolves at some later `t + h`, so a training sample near a fold boundary **overlaps in time**
 * with a test sample. The model is shown the outcome window it is about to be tested on. Without
 * purging, a genuinely worthless strategy routinely cross-validates above 60% — which is exactly
 * the number that makes someone stop looking for the bug.
 */

export interface TimedSample {
  /** When the sample's information is available — the bar it was computed on. */
  time: number;
  /** When the sample's label resolves. The reason purging is necessary. */
  resolvedAt: number;
}

export interface Split {
  trainIndices: number[];
  testIndices: number[];
  /** Samples dropped from training because they overlapped or sat inside the embargo. */
  purgedCount: number;
  embargoedCount: number;
}

/**
 * Purged, embargoed K-fold.
 *
 * Three mechanisms, and each catches a different leak:
 *
 * 1. **Contiguous folds.** Random folds interleave time, so almost every test sample sits between
 *    two training samples that bracket it. Even with purging that is a much weaker test than a
 *    contiguous block.
 * 2. **Purge.** Drop any training sample whose label horizon `[time, resolvedAt]` intersects any
 *    test sample's horizon. This is the literal overlap.
 * 3. **Embargo.** Additionally drop training samples in a window *after* the test block. Serial
 *    correlation leaks across the boundary even with no literal overlap — the bar right after a
 *    test period still carries information about it.
 */
export function purgedKFold(
  samples: TimedSample[],
  folds: number,
  embargoFraction = 0.01,
): Split[] {
  const n = samples.length;
  if (n === 0 || folds < 2) return [];

  // Chronological order is assumed by everything below; sorting here rather than requiring it
  // means a caller cannot silently break the guarantee by passing an unsorted set.
  const order = samples.map((_, i) => i).sort((a, b) => samples[a].time - samples[b].time);

  const foldSize = Math.floor(n / folds);
  if (foldSize === 0) return [];

  const embargoBars = Math.max(1, Math.floor(n * embargoFraction));
  const splits: Split[] = [];

  for (let f = 0; f < folds; f++) {
    const start = f * foldSize;
    const end = f === folds - 1 ? n : start + foldSize;

    const testPositions = order.slice(start, end);
    const testIndices = [...testPositions];

    const testStartTime = Math.min(...testPositions.map((i) => samples[i].time));
    const testEndTime = Math.max(...testPositions.map((i) => samples[i].resolvedAt));

    // The embargo boundary, expressed in time rather than in index positions so an irregular
    // sample spacing does not make the embargo shorter than intended.
    const embargoEndPosition = Math.min(n - 1, end + embargoBars - 1);
    const embargoEndTime = samples[order[embargoEndPosition]].time;

    const trainIndices: number[] = [];
    let purgedCount = 0;
    let embargoedCount = 0;

    for (let p = 0; p < n; p++) {
      if (p >= start && p < end) continue;
      const idx = order[p];
      const s = samples[idx];

      // Purge: the sample's horizon overlaps the test block's span.
      if (s.resolvedAt >= testStartTime && s.time <= testEndTime) {
        purgedCount++;
        continue;
      }
      // Embargo: the sample sits in the window immediately after the test block.
      if (s.time > testEndTime && s.time <= embargoEndTime) {
        embargoedCount++;
        continue;
      }
      trainIndices.push(idx);
    }

    splits.push({ trainIndices, testIndices, purgedCount, embargoedCount });
  }

  return splits;
}

/**
 * A plain (unpurged, uncontiguous) K-fold, provided **only** so a test can demonstrate the leak.
 *
 * Deliberately exported with a name nobody would reach for by accident. It exists to make the
 * failure visible in the test suite — a worthless strategy scoring well here and poorly under
 * `purgedKFold` is the evidence that purging matters, and an argument in a comment is not
 * evidence.
 */
export function naiveKFoldForLeakDemonstration(sampleCount: number, folds: number): Split[] {
  const splits: Split[] = [];
  for (let f = 0; f < folds; f++) {
    const testIndices: number[] = [];
    const trainIndices: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      if (i % folds === f) testIndices.push(i);
      else trainIndices.push(i);
    }
    splits.push({ trainIndices, testIndices, purgedCount: 0, embargoedCount: 0 });
  }
  return splits;
}

export interface WalkForwardWindow {
  trainIndices: number[];
  validationIndices: number[];
  /** Scored once, never optimised against. The only thing reported. */
  testIndices: number[];
  trainStart: number;
  testStart: number;
  testEnd: number;
}

/**
 * Walk-forward: train → validate → out-of-sample, then move the window (docs/18 §3.2).
 *
 * The discipline this encodes: every hyperparameter, every feature-selection decision and every
 * threshold is chosen **inside** the training and validation windows. The out-of-sample segment
 * is scored once. Reported performance is the concatenation of those segments and nothing else.
 *
 * `anchored` keeps the training window's start fixed and lets it grow; rolling drops the oldest
 * data. Both are run, because they disagree in an informative way — a strategy that only works
 * anchored is one whose edge came from a regime that has ended.
 */
export function walkForward(params: {
  samples: TimedSample[];
  trainSize: number;
  validationSize: number;
  testSize: number;
  step?: number;
  anchored?: boolean;
  /** Bars of embargo between the end of validation and the start of test. */
  embargo?: number;
}): WalkForwardWindow[] {
  const { samples, trainSize, validationSize, testSize } = params;
  const step = params.step ?? testSize;
  const embargo = params.embargo ?? 0;
  const n = samples.length;

  const windows: WalkForwardWindow[] = [];
  const total = trainSize + validationSize + embargo + testSize;
  if (n < total) return windows;

  for (let start = 0; start + total <= n; start += step) {
    const trainStart = params.anchored ? 0 : start;
    const trainEnd = start + trainSize;
    const valEnd = trainEnd + validationSize;
    const testStart = valEnd + embargo;
    const testEnd = testStart + testSize;

    windows.push({
      trainIndices: range(trainStart, trainEnd),
      validationIndices: range(trainEnd, valEnd),
      testIndices: range(testStart, testEnd),
      trainStart: samples[trainStart].time,
      testStart: samples[testStart].time,
      testEnd: samples[testEnd - 1].time,
    });
  }

  return windows;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

/**
 * Asserts that no training sample's label horizon reaches into the test block.
 *
 * Exported because it is worth running as an assertion in the harness rather than trusting the
 * splitter — a leak that survives into production research is expensive, and this check is
 * nearly free.
 */
export function assertNoOverlap(samples: TimedSample[], split: Split): { clean: boolean; offenders: number[] } {
  if (split.testIndices.length === 0) return { clean: true, offenders: [] };

  const testStart = Math.min(...split.testIndices.map((i) => samples[i].time));
  const testEnd = Math.max(...split.testIndices.map((i) => samples[i].resolvedAt));

  const offenders = split.trainIndices.filter((i) => {
    const s = samples[i];
    return s.resolvedAt >= testStart && s.time <= testEnd;
  });

  return { clean: offenders.length === 0, offenders };
}
