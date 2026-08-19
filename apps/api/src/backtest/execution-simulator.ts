import { Bar } from './market-view';

export type Side = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface OrderRequest {
  side: Side;
  type: OrderType;
  /** Base-asset quantity. */
  quantity: number;
  /** Required for LIMIT. */
  limitPrice?: number;
  reason?: string;
}

export interface Fill {
  side: Side;
  /** What actually filled. May be less than requested — see `partialFillCap`. */
  quantity: number;
  /** All-in price including spread, slippage and impact. */
  price: number;
  /** Decision price, for measuring implementation shortfall. */
  referencePrice: number;
  fee: number;
  /** Cost attributable to crossing the spread. */
  spreadCost: number;
  /** Cost attributable to size against available liquidity. */
  slippageCost: number;
  /** Cost attributable to the order's own footprint. */
  impactCost: number;
  filledAt: number;
  partial: boolean;
}

export interface CostModel {
  /** Taker fee, fraction of notional. */
  takerFeeRate: number;
  /** Maker fee, fraction of notional. Can be negative on a rebate venue. */
  makerFeeRate: number;
  /** Half-spread as a fraction of price. Entry always crosses it. */
  halfSpreadRate: number;
  /**
   * Slippage per unit of participation. A market order taking 10% of a bar's volume at
   * `slippageCoefficient = 0.1` pays 1% — steep, and deliberately so.
   */
  slippageCoefficient: number;
  /** Square-root market impact coefficient, applied on top of slippage for large orders. */
  impactCoefficient: number;
  /** Maximum share of a bar's volume a single order may take. The rest does not fill. */
  participationCap: number;
  /** Bars between decision and fill. 0 fills on the next bar's open. */
  latencyBars: number;
  /** Perpetual funding per 8h window, as a fraction of notional. */
  fundingRatePer8h: number;
}

/**
 * Realistic costs, and the reason they are not optional.
 *
 * A backtest that fills at the close for free is a random number generator with a nice chart.
 * Every term below removes performance that a live account would never have earned, and the
 * milestone's acceptance test is precisely that turning them on changes the answer materially —
 * a strategy whose edge survives zero-cost but not realistic-cost was never a strategy.
 */
export const REALISTIC_COSTS: CostModel = {
  takerFeeRate: 0.0006,
  makerFeeRate: 0.0002,
  halfSpreadRate: 0.0002,
  slippageCoefficient: 0.1,
  impactCoefficient: 0.05,
  participationCap: 0.05,
  latencyBars: 0,
  fundingRatePer8h: 0.0001,
};

/**
 * The zero-cost model — **for comparison only, never for evaluating a strategy**.
 *
 * It exists so the harness can show, as a number, how much of a result is edge and how much is
 * an artefact of pretending trading is free. Any report produced with this is labelled as such.
 */
export const FRICTIONLESS: CostModel = {
  takerFeeRate: 0,
  makerFeeRate: 0,
  halfSpreadRate: 0,
  slippageCoefficient: 0,
  impactCoefficient: 0,
  participationCap: 1,
  latencyBars: 0,
  fundingRatePer8h: 0,
};

/**
 * Simulates a fill against the bar the order actually reaches.
 *
 * The order is decided at bar `t`'s close and fills during bar `t+1` — never at `t`'s close.
 * Filling at the decision bar's close is the most common and most flattering backtest bug: it
 * hands the strategy a price that existed at the instant it decided, which no venue offers.
 */
export class ExecutionSimulator {
  constructor(private readonly costs: CostModel) {}

  /**
   * @param executionBar the bar the order reaches — `t+1`, supplied by the engine.
   * @param referencePrice the decision-time price, for measuring shortfall.
   */
  simulate(order: OrderRequest, executionBar: Bar, referencePrice: number): Fill | null {
    if (order.quantity <= 0) return null;

    const direction = order.side === 'BUY' ? 1 : -1;

    // Liquidity cap. A position that would exceed a share of the bar's realized volume simply
    // does not fill in full — this is the constraint that stops small-cap strategies from
    // backtesting brilliantly at sizes the market could never absorb.
    const maxQuantity = executionBar.volume * this.costs.participationCap;
    const quantity = Math.min(order.quantity, maxQuantity);
    if (quantity <= 0) return null;
    const partial = quantity < order.quantity;

    if (order.type === 'LIMIT') {
      return this.simulateLimit(order, executionBar, referencePrice, quantity, direction, partial);
    }
    return this.simulateMarket(executionBar, referencePrice, quantity, direction, order.side, partial);
  }

  private simulateMarket(
    bar: Bar,
    referencePrice: number,
    quantity: number,
    direction: number,
    side: Side,
    partial: boolean,
  ): Fill {
    // A market order decided at the previous close reaches the venue at this bar's open. That is
    // the honest base price — not the close, which is information the decision did not have.
    const base = bar.open;

    const spreadCost = base * this.costs.halfSpreadRate;

    // Participation-based slippage: cost rises with the share of the bar you are taking.
    const participation = bar.volume > 0 ? quantity / bar.volume : 1;
    const slippageCost = base * this.costs.slippageCoefficient * participation;

    // Square-root impact: the order's own footprint, on top of crossing the book.
    const impactCost = base * this.costs.impactCoefficient * Math.sqrt(Math.max(0, participation));

    const price = base + direction * (spreadCost + slippageCost + impactCost);
    const fee = price * quantity * this.costs.takerFeeRate;

    return {
      side,
      quantity,
      price,
      referencePrice,
      fee,
      spreadCost: spreadCost * quantity,
      slippageCost: slippageCost * quantity,
      impactCost: impactCost * quantity,
      filledAt: bar.closeTime,
      partial,
    };
  }

  /**
   * A limit order fills only if the bar actually traded through its price.
   *
   * Note what is *not* modelled: queue position. A limit at the exact touch that the bar merely
   * reached is treated as filled here, which is optimistic — in reality you may sit behind
   * enough size that the level trades without you. Stated rather than hidden, because a limit
   * strategy's backtest is more optimistic than this simulator can currently prove.
   */
  private simulateLimit(
    order: OrderRequest,
    bar: Bar,
    referencePrice: number,
    quantity: number,
    direction: number,
    partial: boolean,
  ): Fill | null {
    const limit = order.limitPrice;
    if (limit === undefined) return null;

    const traded = order.side === 'BUY' ? bar.low <= limit : bar.high >= limit;
    if (!traded) return null;

    // A resting order does not cross the spread, and pays the maker fee.
    const price = limit;
    const fee = Math.abs(price * quantity * this.costs.makerFeeRate);

    return {
      side: order.side,
      quantity,
      price,
      referencePrice,
      fee,
      spreadCost: 0,
      slippageCost: 0,
      impactCost: 0,
      filledAt: bar.closeTime,
      partial,
    };
  }

  /**
   * Funding accrued on a held perpetual position over an interval.
   *
   * Charged on every window a position spans, not netted at the end. A strategy holding through
   * a high-funding regime pays for it, and on multi-day holds this is frequently larger than the
   * trading fees.
   */
  fundingFor(notional: number, fromMs: number, toMs: number, side: Side): number {
    const windows = Math.max(0, (toMs - fromMs) / (8 * 3_600_000));
    const cost = Math.abs(notional) * this.costs.fundingRatePer8h * windows;
    // A long pays funding when the rate is positive; a short receives it. Modelled with the
    // configured rate as the long's cost, which is the usual sign convention.
    return side === 'BUY' ? cost : -cost;
  }

  get model(): CostModel {
    return this.costs;
  }
}
