/**
 * Regularised logistic regression — the **mandatory baseline** (docs/18 §2.1).
 *
 * Its job is not to be the production model. It is to be the number every other model has to
 * beat out of sample. A gradient-boosted ensemble that cannot beat a regularised linear model on
 * the same purged splits is not adding anything, and deleting it is the correct response.
 *
 * It is also what makes the negative controls runnable at all. A control like "shuffling the
 * labels must destroy performance" needs *something* to train, and it needs that something to be
 * simple enough that a failure points at the harness rather than at the model.
 *
 * Written here rather than pulled from a library because the training path must be deterministic
 * and inspectable — a research artefact has to be reproducible from its inputs, and "whatever
 * version of the package was installed that day" is not an input anybody records.
 */

export interface TrainedModel {
  weights: number[];
  intercept: number;
  featureNames: string[];
  /** Column means and standard deviations from the TRAINING set only. */
  standardisation: { means: number[]; stds: number[] };
  iterations: number;
  converged: boolean;
}

export interface TrainConfig {
  learningRate: number;
  maxIterations: number;
  /** L2 penalty. Not optional: with hundreds of correlated features, unregularised is unusable. */
  l2: number;
  tolerance: number;
}

export const DEFAULT_TRAIN_CONFIG: TrainConfig = {
  learningRate: 0.1,
  maxIterations: 500,
  l2: 1.0,
  tolerance: 1e-6,
};

/**
 * Fits a binary classifier by gradient descent on the log-loss.
 *
 * Two details that matter more than the optimiser:
 *
 * **Standardisation uses training statistics only.** Computing the mean and standard deviation
 * over the whole dataset before splitting is a leak — a quiet one, because it moves accuracy by a
 * little rather than a lot, and it is present in an enormous amount of published work. The stats
 * are stored on the model so the test set is transformed by the training set's parameters.
 *
 * **Null features are imputed to the training mean**, which after standardisation is exactly
 * zero. That is the honest encoding of "no information": it contributes nothing to the decision.
 * Imputing a raw zero before standardisation would instead assert a specific, usually extreme,
 * value.
 */
export function trainLogistic(
  X: Array<Array<number | null>>,
  y: number[],
  featureNames: string[],
  weights?: number[],
  config: TrainConfig = DEFAULT_TRAIN_CONFIG,
): TrainedModel {
  const n = X.length;
  const d = featureNames.length;
  if (n === 0 || d === 0) {
    return {
      weights: new Array(d).fill(0),
      intercept: 0,
      featureNames,
      standardisation: { means: new Array(d).fill(0), stds: new Array(d).fill(1) },
      iterations: 0,
      converged: false,
    };
  }

  const standardisation = fitStandardisation(X, d);
  const Z = standardise(X, standardisation);

  const sampleWeights = weights ?? new Array(n).fill(1);
  const weightSum = sampleWeights.reduce((a, b) => a + b, 0) || 1;

  const w = new Array(d).fill(0);
  let b = 0;
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    iterations = iter + 1;
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const p = sigmoid(z);
      const err = (p - y[i]) * sampleWeights[i];
      for (let j = 0; j < d; j++) gradW[j] += err * Z[i][j];
      gradB += err;
    }

    let maxStep = 0;
    for (let j = 0; j < d; j++) {
      // L2 on the weights, never on the intercept — penalising the intercept shifts the base
      // rate toward 0.5 and is simply a bug that looks like regularisation.
      const g = gradW[j] / weightSum + config.l2 * w[j] / n;
      const step = config.learningRate * g;
      w[j] -= step;
      if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
    }
    const stepB = config.learningRate * (gradB / weightSum);
    b -= stepB;
    if (Math.abs(stepB) > maxStep) maxStep = Math.abs(stepB);

    if (maxStep < config.tolerance) {
      converged = true;
      break;
    }
  }

  return { weights: w, intercept: b, featureNames, standardisation, iterations, converged };
}

export function predictProbabilities(model: TrainedModel, X: Array<Array<number | null>>): number[] {
  const Z = standardise(X, model.standardisation);
  return Z.map((row) => {
    let z = model.intercept;
    for (let j = 0; j < model.weights.length; j++) z += model.weights[j] * row[j];
    return sigmoid(z);
  });
}

function fitStandardisation(X: Array<Array<number | null>>, d: number) {
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(1);

  for (let j = 0; j < d; j++) {
    const present: number[] = [];
    for (const row of X) {
      const v = row[j];
      if (v !== null && Number.isFinite(v)) present.push(v);
    }
    if (present.length === 0) continue;

    const m = present.reduce((a, b) => a + b, 0) / present.length;
    means[j] = m;
    if (present.length > 1) {
      const variance = present.reduce((a, v) => a + (v - m) ** 2, 0) / (present.length - 1);
      // A zero-variance column carries no information; leaving its std at 1 makes it a constant
      // zero after centring rather than a division by zero.
      stds[j] = variance > 0 ? Math.sqrt(variance) : 1;
    }
  }
  return { means, stds };
}

function standardise(
  X: Array<Array<number | null>>,
  s: { means: number[]; stds: number[] },
): number[][] {
  return X.map((row) =>
    row.map((v, j) => {
      // Null → 0 after standardisation, which is the training mean: contributes nothing.
      if (v === null || !Number.isFinite(v)) return 0;
      return (v - s.means[j]) / s.stds[j];
    }),
  );
}

function sigmoid(z: number): number {
  // Split by sign to avoid overflow in exp for large |z|.
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

// ── Evaluation ──────────────────────────────────────────────────────────

/**
 * Area under the ROC curve, by rank.
 *
 * Chosen over accuracy as the headline because it is threshold-free and insensitive to class
 * imbalance — an accuracy figure on a 55/45 label set says more about the base rate than about
 * the model. **0.5 is chance**, and on this problem a genuinely good model lives around 0.53–0.57.
 * Anything much above that is a leak, not a discovery.
 */
export function rocAuc(labels: number[], scores: number[]): number | null {
  const positives = labels.filter((l) => l === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const order = scores.map((s, i) => ({ s, l: labels[i] })).sort((a, b) => a.s - b.s);

  // Mid-ranks, so ties do not inflate the statistic.
  const ranks = new Array(order.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }

  let rankSum = 0;
  for (let k = 0; k < order.length; k++) if (order[k].l === 1) rankSum += ranks[k];

  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Log loss. Lower is better; a model predicting the base rate everywhere is the thing to beat. */
export function logLoss(labels: number[], probabilities: number[]): number {
  if (labels.length === 0) return 0;
  const eps = 1e-15;
  let acc = 0;
  for (let i = 0; i < labels.length; i++) {
    const p = Math.min(1 - eps, Math.max(eps, probabilities[i]));
    acc += labels[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return acc / labels.length;
}

/**
 * Brier score and a reliability table — the calibration check (docs/18 §2.2).
 *
 * A model whose 0.7 bucket resolves at 0.55 is misreporting even if its ranking is excellent, and
 * ranking metrics like AUC cannot see that at all. This is what the investor-facing calibration
 * chart is built from.
 */
export function calibration(
  labels: number[],
  probabilities: number[],
  buckets = 10,
): { brier: number; table: Array<{ bucket: number; predicted: number; actual: number; count: number }> } {
  const table: Array<{ bucket: number; predicted: number; actual: number; count: number }> = [];
  let brier = 0;
  for (let i = 0; i < labels.length; i++) brier += (probabilities[i] - labels[i]) ** 2;
  brier = labels.length === 0 ? 0 : brier / labels.length;

  for (let b = 0; b < buckets; b++) {
    const lo = b / buckets;
    const hi = (b + 1) / buckets;
    const members: number[] = [];
    const preds: number[] = [];
    for (let i = 0; i < labels.length; i++) {
      const p = probabilities[i];
      if (p >= lo && (p < hi || (b === buckets - 1 && p <= hi))) {
        members.push(labels[i]);
        preds.push(p);
      }
    }
    if (members.length === 0) continue;
    table.push({
      bucket: b,
      predicted: preds.reduce((a, x) => a + x, 0) / preds.length,
      actual: members.reduce((a, x) => a + x, 0) / members.length,
      count: members.length,
    });
  }

  return { brier, table };
}
