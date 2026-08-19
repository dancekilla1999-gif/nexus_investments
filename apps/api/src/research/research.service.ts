import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeatureEngineService } from '../features/feature-engine.service';
import { buildFeatureSet, requiredHistory } from '../features/registry';
import { toWindow } from '../features/window';
import { CandleRepository } from '../marketdata/candle.repository';
import { TIMEFRAME_MS, Timeframe } from '../marketdata/ohlcv-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BARRIER_CONFIG,
  TripleBarrierConfig,
  TripleBarrierLabel,
  labelBalance,
  tripleBarrier,
  uniquenessWeights,
} from './labelling';
import { Dataset, NegativeControls } from './negative-controls';
import { purgedKFold, walkForward } from './splitting';
import {
  deflatedSharpe,
  kurtosis,
  performanceMetrics,
  probabilityOfBacktestOverfitting,
  skewness,
} from './statistics';
import { predictProbabilities, rocAuc, trainLogistic } from './logistic-regression';
import { BacktestEngine, BacktestResult, Strategy } from '../backtest/backtest-engine';
import { CostModel, FRICTIONLESS, REALISTIC_COSTS } from '../backtest/execution-simulator';

export interface DatasetSpec {
  symbol: string;
  timeframe: Timeframe;
  /** Bars of history to build the dataset over. */
  bars: number;
  asOf?: Date;
  barrier?: Partial<TripleBarrierConfig>;
  contextTimeframes?: Timeframe[];
}

export interface WalkForwardReport {
  windows: number;
  oosAuc: number | null;
  oosMetrics: ReturnType<typeof performanceMetrics>;
  perWindowAuc: number[];
  trials: number;
  deflatedSharpe: number | null;
  expectedMaxSharpe: number;
  pbo: number | null;
  verdict: string;
}

/**
 * The research harness (docs/18 §3, roadmap MVP34).
 *
 * Builds a labelled dataset from the feature store, splits it without leaking, trains the
 * mandatory baseline, and reports performance corrected for how hard the search looked. It is
 * not a model — it is the apparatus that decides whether a model's number is evidence.
 *
 * Every dataset is built through the same `asOf`-filtered feature engine the live path uses
 * (MVP33), so "the backtest" is not a separate code path with its own assumptions.
 */
@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly candles: CandleRepository,
    private readonly features: FeatureEngineService,
  ) {}

  /**
   * Builds features and triple-barrier labels over a span of history.
   *
   * The critical detail is the loop: **each row's features are computed as of that bar's close**,
   * through the point-in-time repository, exactly as they would have been live. Computing the
   * whole feature matrix once from the final window and then slicing it would be far faster and
   * would leak — the rolling statistics would carry information from bars that had not printed.
   */
  async buildDataset(spec: DatasetSpec): Promise<{
    dataset: Dataset;
    labels: TripleBarrierLabel[];
    balance: ReturnType<typeof labelBalance>;
    labelDefinition: string;
  }> {
    const asOf = spec.asOf ?? new Date();
    const barrier = { ...DEFAULT_BARRIER_CONFIG, ...spec.barrier };
    const contexts = spec.contextTimeframes ?? [];

    const warmup = requiredHistory(buildFeatureSet(spec.timeframe));
    const rows = await this.candles.knowableAt({
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      asOf,
      limit: spec.bars + warmup,
    });
    if (rows.length < warmup + barrier.volLookback + barrier.maxHoldingBars + 20) {
      throw new Error(
        `Not enough history for ${spec.symbol} ${spec.timeframe}: ${rows.length} bars, ` +
          `need at least ${warmup + barrier.volLookback + barrier.maxHoldingBars + 20}.`,
      );
    }

    const window = toWindow(rows);
    const labels = tripleBarrier(window, barrier);

    // Only labels whose entry bar has enough warmup behind it can have a full feature vector.
    const usable = labels.filter((l) => l.index >= warmup - 1);

    const featureNames = buildFeatureSet(spec.timeframe).map((s) => s.id);
    const X: Array<Array<number | null>> = [];
    const y: number[] = [];
    const kept: TripleBarrierLabel[] = [];

    for (const label of usable) {
      // The instant this row would have been decided at: the entry bar's close.
      const rowAsOf = new Date(label.entryTime);
      const { vector } = await this.features.compute({
        symbol: spec.symbol,
        timeframe: spec.timeframe,
        asOf: rowAsOf,
        contextTimeframes: contexts,
        skipQualityGate: true,
      });
      if (!vector) continue;

      // Timeouts are dropped from a directional binary target rather than folded into one side.
      // Calling a timeout "not up" teaches the model that a flat market is a short, which is a
      // different and wrong claim.
      if (label.label === 0) continue;

      X.push(featureNames.map((id) => vector.values[id] ?? null));
      y.push(label.label === 1 ? 1 : 0);
      kept.push(label);
    }

    const weights = uniquenessWeights(kept);
    const dataset: Dataset = {
      featureNames,
      X,
      y,
      weights,
      samples: kept.map((l) => ({ time: l.entryTime, resolvedAt: l.resolvedAt })),
    };

    const labelDefinition =
      `tb:tp=${barrier.tpMultiple},sl=${barrier.slMultiple},` +
      `hold=${barrier.maxHoldingBars},vol=${barrier.volLookback}`;

    return { dataset, labels: kept, balance: labelBalance(kept), labelDefinition };
  }

  /**
   * Walk-forward evaluation, with the trial counted and the Sharpe deflated for it.
   *
   * The counter increments **before** the result is known, so a disappointing run costs the same
   * as a promising one. Counting only successes would make the correction meaningless — the
   * whole point is to price how many times you looked.
   */
  async walkForwardEvaluate(params: {
    spec: DatasetSpec;
    trainSize?: number;
    validationSize?: number;
    testSize?: number;
    notes?: string;
  }): Promise<WalkForwardReport> {
    const { dataset, labels, labelDefinition } = await this.buildDataset(params.spec);
    const scope = `${params.spec.symbol}|${params.spec.timeframe}|${labelDefinition}`;

    const n = dataset.X.length;
    const trainSize = params.trainSize ?? Math.floor(n * 0.5);
    const validationSize = params.validationSize ?? Math.floor(n * 0.15);
    const testSize = params.testSize ?? Math.floor(n * 0.15);

    const windows = walkForward({
      samples: dataset.samples,
      trainSize,
      validationSize,
      testSize,
      embargo: Math.max(1, Math.floor(n * 0.01)),
    });

    const perWindowAuc: number[] = [];
    const oosReturns: number[] = [];

    for (const w of windows) {
      const trainIdx = [...w.trainIndices, ...w.validationIndices];
      const trainY = trainIdx.map((i) => dataset.y[i]);
      if (new Set(trainY).size < 2) continue;

      const model = trainLogistic(
        trainIdx.map((i) => dataset.X[i]),
        trainY,
        dataset.featureNames,
        trainIdx.map((i) => dataset.weights[i]),
      );

      const testY = w.testIndices.map((i) => dataset.y[i]);
      const probs = predictProbabilities(model, w.testIndices.map((i) => dataset.X[i]));
      const auc = rocAuc(testY, probs);
      if (auc !== null) perWindowAuc.push(auc);

      // Trade only where the model is confident, in the direction it points, and take the R the
      // label actually resolved at. No sizing, no costs — this is the harness measuring signal,
      // and the execution-cost model belongs to the backtester (MVP35).
      for (let k = 0; k < w.testIndices.length; k++) {
        const idx = w.testIndices[k];
        const p = probs[k];
        if (p > 0.55) oosReturns.push(labels[idx].realizedR);
        else if (p < 0.45) oosReturns.push(-labels[idx].realizedR);
      }
    }

    const oosAuc =
      perWindowAuc.length === 0 ? null : perWindowAuc.reduce((a, b) => a + b, 0) / perWindowAuc.length;
    const metrics = performanceMetrics(oosReturns);

    const trials = await this.countAndRecordTrial({
      scope,
      symbol: params.spec.symbol,
      timeframe: params.spec.timeframe,
      labelDefinition,
      config: { ...params.spec, trainSize, validationSize, testSize },
      auc: oosAuc,
      sharpe: metrics.sharpe,
      notes: params.notes,
    });

    let deflated: number | null = null;
    let expectedMax = 0;
    if (metrics.sharpe !== null && oosReturns.length > 10) {
      const d = deflatedSharpe({
        observedSharpe: metrics.sharpe,
        trials,
        sampleSize: oosReturns.length,
        skew: skewness(oosReturns),
        kurtosis: kurtosis(oosReturns),
      });
      deflated = d.deflated;
      expectedMax = d.expectedMaxSharpe;
    }

    const pbo = probabilityOfBacktestOverfitting(
      perWindowAuc.length >= 4 ? [perWindowAuc, perWindowAuc.map(() => 0.5)] : [],
    );

    return {
      windows: windows.length,
      oosAuc,
      oosMetrics: metrics,
      perWindowAuc,
      trials,
      deflatedSharpe: deflated,
      expectedMaxSharpe: expectedMax,
      pbo,
      verdict: this.verdict(oosAuc, deflated, trials),
    };
  }

  /** Runs the negative controls on a freshly built dataset. */
  async runControls(spec: DatasetSpec) {
    const { dataset, balance } = await this.buildDataset(spec);
    const result = new NegativeControls().run(dataset);
    return { balance, samples: dataset.X.length, ...result };
  }

  /**
   * Increments the counter and returns the new total for this scope.
   *
   * Recorded before the caller can decide whether they liked the answer.
   */
  private async countAndRecordTrial(params: {
    scope: string;
    symbol: string;
    timeframe: string;
    labelDefinition: string;
    config: unknown;
    auc: number | null;
    sharpe: number | null;
    controlsPassed?: boolean;
    notes?: string;
  }): Promise<number> {
    await this.prisma.researchExperiment.create({
      data: {
        scope: params.scope,
        symbol: params.symbol,
        timeframe: params.timeframe,
        labelDefinition: params.labelDefinition,
        config: params.config as Prisma.InputJsonValue,
        auc: params.auc,
        sharpe: params.sharpe,
        controlsPassed: params.controlsPassed ?? false,
        notes: params.notes,
      },
    });
    return this.prisma.researchExperiment.count({ where: { scope: params.scope } });
  }

  async trialCount(scope: string): Promise<number> {
    return this.prisma.researchExperiment.count({ where: { scope } });
  }

  async experiments(scope?: string, limit = 100) {
    return this.prisma.researchExperiment.findMany({
      where: scope ? { scope } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  /**
   * A plain-language conclusion, deliberately pessimistic.
   *
   * A harness that reports "promising" on a marginal result is a harness that gets a marginal
   * result promoted. The thresholds here are the ones docs/18 §5.3 gates on.
   */
  private verdict(auc: number | null, deflated: number | null, trials: number): string {
    if (auc === null) return 'No out-of-sample result — not enough data to evaluate.';
    if (auc <= 0.52) {
      return `Out-of-sample AUC ${auc.toFixed(4)} is indistinguishable from chance. Not a strategy.`;
    }
    if (deflated === null) {
      return `AUC ${auc.toFixed(4)} out of sample, but too few trades to deflate the Sharpe. Inconclusive.`;
    }
    if (deflated < 0.95) {
      return (
        `AUC ${auc.toFixed(4)}, but the deflated Sharpe probability is ${deflated.toFixed(3)} after ` +
        `${trials} trial(s) in this scope — below the 0.95 bar. Not distinguishable from the best of ` +
        'that many random attempts.'
      );
    }
    return (
      `AUC ${auc.toFixed(4)} with a deflated Sharpe probability of ${deflated.toFixed(3)} after ` +
      `${trials} trial(s). Clears the statistical bar; still requires the negative controls and ` +
      'paper trading before promotion.'
    );
  }

  /** Cross-validated AUC under purged, embargoed folds — the honest in-sample number. */
  async crossValidate(spec: DatasetSpec, folds = 5) {
    const { dataset, balance } = await this.buildDataset(spec);
    const splits = purgedKFold(dataset.samples, folds);
    const controls = new NegativeControls(folds);
    const { auc, foldAucs } = controls.crossValidatedAuc(dataset, splits);

    return {
      samples: dataset.X.length,
      balance,
      folds: splits.length,
      purgedTotal: splits.reduce((a, s) => a + s.purgedCount, 0),
      embargoedTotal: splits.reduce((a, s) => a + s.embargoedCount, 0),
      auc,
      foldAucs,
    };
  }

  /**
   * Runs a strategy through the event-driven backtester over real stored bars, **twice** — once
   * frictionless and once with realistic costs — and reports both (docs/18 §4.2).
   *
   * Both, always, and never the frictionless one alone. The gap between them is the single most
   * informative number in a backtest report: it says how much of an apparent edge is edge and how
   * much is an artefact of pretending trading is free. Reporting only the friction-free figure is
   * the most common way a genuine backtest still misleads, and the shape of this method is what
   * stops it happening by omission.
   */
  async backtest(params: {
    strategy: Strategy;
    symbol: string;
    timeframe: Timeframe;
    bars: number;
    asOf?: Date;
    initialEquity?: number;
    costs?: CostModel;
  }): Promise<{ realistic: BacktestResult; frictionless: BacktestResult; costOfTrading: number }> {
    const asOf = params.asOf ?? new Date();
    const candles = await this.candles.knowableAt({
      symbol: params.symbol,
      timeframe: params.timeframe,
      asOf,
      limit: params.bars,
    });
    if (candles.length < params.strategy.warmupBars + 10) {
      throw new Error(
        `Not enough history for ${params.symbol} ${params.timeframe}: ${candles.length} bars, ` +
          `the strategy needs ${params.strategy.warmupBars + 10}.`,
      );
    }

    const initialEquity = params.initialEquity ?? 100_000;
    const run = (costs: CostModel) =>
      new BacktestEngine({ initialEquity, costs }).run({
        strategy: params.strategy,
        symbol: params.symbol,
        timeframe: params.timeframe,
        candles,
      });

    const realistic = run(params.costs ?? REALISTIC_COSTS);
    const frictionless = run(FRICTIONLESS);

    return {
      realistic,
      frictionless,
      costOfTrading: frictionless.finalEquity - realistic.finalEquity,
    };
  }

  /** Bars needed before a dataset of the requested size can be built. */
  historyRequired(timeframe: Timeframe, bars: number, barrier = DEFAULT_BARRIER_CONFIG): number {
    return requiredHistory(buildFeatureSet(timeframe)) + bars + barrier.maxHoldingBars;
  }

  spanFor(timeframe: Timeframe, bars: number): number {
    return TIMEFRAME_MS[timeframe] * bars;
  }
}
