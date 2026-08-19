import { StoredCandle } from '../marketdata/candle.repository';
import { performanceMetrics } from '../research/statistics';
import { CostModel, ExecutionSimulator, Fill, OrderRequest, Side } from './execution-simulator';
import { Bar, MarketView, ReplayMarketView } from './market-view';

/**
 * What a strategy is: a function from what it can see to what it wants to do.
 *
 * It receives a `MarketView`, which has no way to name a future timestamp, and a `Position`,
 * which describes what it currently holds. It returns orders. It has no access to the clock's
 * setter, to the candle store, or to the bar its order will fill in.
 */
export interface Strategy {
  readonly name: string;
  /** Bars of history required before the strategy should be asked for anything. */
  readonly warmupBars: number;
  onBar(view: MarketView, position: Position): OrderRequest[];
}

export interface Position {
  /** Signed base quantity. Zero means flat. */
  quantity: number;
  /** Volume-weighted entry price of the current position. */
  averagePrice: number;
  openedAt: number | null;
}

export interface Trade {
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryAt: number;
  exitAt: number;
  /** Net of every cost. */
  pnl: number;
  fees: number;
  funding: number;
  spreadCost: number;
  slippageCost: number;
  impactCost: number;
  /** PnL as a multiple of the risk taken, when the strategy declared one. */
  returnPct: number;
}

export interface BacktestResult {
  strategy: string;
  symbol: string;
  timeframe: string;
  barsSimulated: number;
  trades: Trade[];
  /** Equity curve in quote currency, one point per bar. */
  equityCurve: number[];
  finalEquity: number;
  initialEquity: number;
  totalFees: number;
  totalFunding: number;
  totalSpreadCost: number;
  totalSlippageCost: number;
  totalImpactCost: number;
  rejectedForLiquidity: number;
  partialFills: number;
  metrics: ReturnType<typeof performanceMetrics>;
  /** True when the run used the frictionless model. Reports must say so. */
  frictionless: boolean;
}

export interface BacktestConfig {
  initialEquity: number;
  costs: CostModel;
  /** Feature vectors keyed by bar close time, precomputed by the caller. */
  featuresByBar?: Map<number, Record<string, number | null>>;
}

/**
 * Event-driven backtester (docs/18 §4.1, roadmap MVP35).
 *
 * A replay clock advances one bar at a time. At each step the strategy sees only closed bars up
 * to the clock, decides, and its orders fill in the **next** bar through the execution simulator.
 * There is no vectorised path and no second indicator implementation: features come from the same
 * engine the live system uses, computed at each bar's own `asOf`.
 *
 * The engine differs from production in exactly one component — the simulator replaces the venue.
 * That is the whole point of the design, and it is what makes a backtest result mean something
 * about live behaviour rather than about the backtest.
 */
export class BacktestEngine {
  constructor(private readonly config: BacktestConfig) {}

  run(params: {
    strategy: Strategy;
    symbol: string;
    timeframe: string;
    candles: StoredCandle[];
  }): BacktestResult {
    const view = new ReplayMarketView(params.symbol, params.timeframe, params.candles);
    const sim = new ExecutionSimulator(this.config.costs);

    const position: Position = { quantity: 0, averagePrice: 0, openedAt: null };
    let cash = this.config.initialEquity;
    let equity = this.config.initialEquity;

    const trades: Trade[] = [];
    const equityCurve: number[] = [];

    let totalFees = 0;
    let totalFunding = 0;
    let totalSpread = 0;
    let totalSlippage = 0;
    let totalImpact = 0;
    let rejectedForLiquidity = 0;
    let partialFills = 0;

    // Cost accumulators for the currently open position, so a trade's record carries the costs
    // it actually incurred rather than a share of the run's total.
    let openFees = 0;
    let openFunding = 0;
    let openSpread = 0;
    let openSlippage = 0;
    let openImpact = 0;
    let lastFundingAt = 0;

    let barsSimulated = 0;

    while (view.advance(this.featuresAt(view))) {
      const bar = view.latest();
      barsSimulated++;

      // ── Funding on anything held across this bar ──
      if (position.quantity !== 0 && lastFundingAt > 0) {
        const notional = Math.abs(position.quantity) * bar.close;
        const side: Side = position.quantity > 0 ? 'BUY' : 'SELL';
        const funding = sim.fundingFor(notional, lastFundingAt, bar.closeTime, side);
        cash -= funding;
        openFunding += funding;
        totalFunding += funding;
      }
      if (position.quantity !== 0) lastFundingAt = bar.closeTime;

      // ── Ask the strategy, once warmed up ──
      if (view.barsSeen >= params.strategy.warmupBars) {
        const orders = params.strategy.onBar(view, { ...position });

        // Orders fill in the NEXT bar. On the final bar there is no next bar, so nothing fills —
        // which is correct: a decision at the end of the data has nowhere to execute.
        const executionBar = view.nextBarForExecution();
        if (executionBar) {
          for (const order of orders) {
            const fill = sim.simulate(order, executionBar, bar.close);
            if (!fill) {
              rejectedForLiquidity++;
              continue;
            }
            if (fill.partial) partialFills++;

            totalFees += fill.fee;
            totalSpread += fill.spreadCost;
            totalSlippage += fill.slippageCost;
            totalImpact += fill.impactCost;

            const closing = this.applyFill(position, fill, {
              onOpen: () => {
                openFees = fill.fee;
                openFunding = 0;
                openSpread = fill.spreadCost;
                openSlippage = fill.slippageCost;
                openImpact = fill.impactCost;
                lastFundingAt = fill.filledAt;
              },
              onAdd: () => {
                openFees += fill.fee;
                openSpread += fill.spreadCost;
                openSlippage += fill.slippageCost;
                openImpact += fill.impactCost;
              },
            });

            cash += closing.cashDelta - fill.fee;

            if (closing.trade) {
              trades.push({
                ...closing.trade,
                fees: openFees + fill.fee,
                funding: openFunding,
                spreadCost: openSpread + fill.spreadCost,
                slippageCost: openSlippage + fill.slippageCost,
                impactCost: openImpact + fill.impactCost,
                pnl: closing.trade.pnl - (openFees + fill.fee) - openFunding,
              });
              openFees = 0;
              openFunding = 0;
              openSpread = 0;
              openSlippage = 0;
              openImpact = 0;
              lastFundingAt = 0;
            }
          }
        }
      }

      equity = cash + position.quantity * bar.close;
      equityCurve.push(equity);
    }

    // Per-trade returns as a fraction of the notional risked, which is what `performanceMetrics`
    // expects. Not R-multiples: this engine does not know the strategy's stop.
    const returns = trades.map((t) => t.returnPct);

    return {
      strategy: params.strategy.name,
      symbol: params.symbol,
      timeframe: params.timeframe,
      barsSimulated,
      trades,
      equityCurve,
      finalEquity: equity,
      initialEquity: this.config.initialEquity,
      totalFees,
      totalFunding,
      totalSpreadCost: totalSpread,
      totalSlippageCost: totalSlippage,
      totalImpactCost: totalImpact,
      rejectedForLiquidity,
      partialFills,
      metrics: performanceMetrics(returns),
      frictionless:
        this.config.costs.takerFeeRate === 0 &&
        this.config.costs.halfSpreadRate === 0 &&
        this.config.costs.slippageCoefficient === 0,
    };
  }

  /**
   * Applies a fill to the position, closing out and recording a trade when the sign flips or
   * reaches zero.
   *
   * A fill that reverses through zero is handled as a close plus an open, which is what actually
   * happens: the closing leg realises its PnL and the remainder starts a new position at the fill
   * price. Treating a reversal as one continuous position would silently merge two trades and
   * make the trade count — and every per-trade statistic — wrong.
   */
  private applyFill(
    position: Position,
    fill: Fill,
    hooks: { onOpen: () => void; onAdd: () => void },
  ): { cashDelta: number; trade: Omit<Trade, 'fees' | 'funding' | 'spreadCost' | 'slippageCost' | 'impactCost'> | null } {
    const signed = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    const before = position.quantity;
    const cashDelta = -signed * fill.price;

    // Flat → open.
    if (before === 0) {
      position.quantity = signed;
      position.averagePrice = fill.price;
      position.openedAt = fill.filledAt;
      hooks.onOpen();
      return { cashDelta, trade: null };
    }

    // Same direction → add.
    if (Math.sign(before) === Math.sign(signed)) {
      const total = before + signed;
      position.averagePrice = (position.averagePrice * before + fill.price * signed) / total;
      position.quantity = total;
      hooks.onAdd();
      return { cashDelta, trade: null };
    }

    // Opposite direction → reduce or close.
    const closedQuantity = Math.min(Math.abs(before), Math.abs(signed));
    const entrySide: Side = before > 0 ? 'BUY' : 'SELL';
    const grossPnl =
      before > 0
        ? (fill.price - position.averagePrice) * closedQuantity
        : (position.averagePrice - fill.price) * closedQuantity;

    const notional = position.averagePrice * closedQuantity;
    const trade = {
      side: entrySide,
      quantity: closedQuantity,
      entryPrice: position.averagePrice,
      exitPrice: fill.price,
      entryAt: position.openedAt ?? fill.filledAt,
      exitAt: fill.filledAt,
      pnl: grossPnl,
      returnPct: notional === 0 ? 0 : grossPnl / notional,
    };

    const remaining = before + signed;
    if (remaining === 0) {
      position.quantity = 0;
      position.averagePrice = 0;
      position.openedAt = null;
    } else if (Math.sign(remaining) === Math.sign(before)) {
      // Partial reduction: the rest of the position stays open at its original average.
      position.quantity = remaining;
    } else {
      // Reversal: the excess opens a new position at the fill price.
      position.quantity = remaining;
      position.averagePrice = fill.price;
      position.openedAt = fill.filledAt;
      hooks.onOpen();
    }

    return { cashDelta, trade };
  }

  private featuresAt(view: ReplayMarketView): Record<string, number | null> {
    if (!this.config.featuresByBar) return {};
    const next = view.nextBarForExecution();
    // The features for the bar about to become current.
    return (next && this.config.featuresByBar.get(next.closeTime)) ?? {};
  }
}

/** Convenience for a strategy that wants a target position rather than orders. */
export function ordersForTarget(
  position: Position,
  targetQuantity: number,
  reason?: string,
): OrderRequest[] {
  const delta = targetQuantity - position.quantity;
  if (Math.abs(delta) < 1e-12) return [];
  return [
    {
      side: delta > 0 ? 'BUY' : 'SELL',
      type: 'MARKET',
      quantity: Math.abs(delta),
      reason,
    },
  ];
}

export type { Bar };
