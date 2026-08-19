import { Prisma } from '@prisma/client';
import { StoredCandle } from '../marketdata/candle.repository';
import { BacktestEngine, Position, Strategy, ordersForTarget } from './backtest-engine';
import {
  ExecutionSimulator,
  FRICTIONLESS,
  REALISTIC_COSTS,
} from './execution-simulator';
import { MarketView, ReplayMarketView } from './market-view';

/**
 * The event-driven backtester (docs/18 §4, roadmap MVP35).
 *
 * Two claims are being tested. That **asking for the future is inexpressible**, not merely
 * discouraged — checked at the type level, since a runtime guard can be bypassed and a convention
 * can be forgotten. And that **costs matter enough to change the answer**, which is the whole
 * argument for modelling them: a strategy whose edge does not survive realistic friction was
 * never a strategy, and a backtest that fills at the close for free cannot tell you that.
 */

function candles(closes: number[], opts: { volume?: number; spread?: number } = {}): StoredCandle[] {
  const spread = opts.spread ?? 0.002;
  return closes.map((c, i) => ({
    source: 'test',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    openTime: new Date(i * 3_600_000),
    closeTime: new Date((i + 1) * 3_600_000),
    open: new Prisma.Decimal(c.toFixed(8)),
    high: new Prisma.Decimal((c * (1 + spread)).toFixed(8)),
    low: new Prisma.Decimal((c * (1 - spread)).toFixed(8)),
    close: new Prisma.Decimal(c.toFixed(8)),
    volume: new Prisma.Decimal((opts.volume ?? 1000).toFixed(8)),
    trades: null,
    ingestTime: new Date((i + 1) * 3_600_000),
  }));
}

function ramp(n: number, start = 100, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function walk(n: number, seed = 5, vol = 0.02): number[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + (rand() - 0.5) * vol));
  return out;
}

/** Buys one unit on the first eligible bar and holds. */
const buyAndHold: Strategy = {
  name: 'buy-and-hold',
  warmupBars: 2,
  onBar: (_view: MarketView, position: Position) =>
    position.quantity === 0 ? ordersForTarget(position, 1, 'entry') : [],
};

/**
 * Trades the previous bar's direction, every bar.
 *
 * On an alternating series this is genuinely profitable with no costs — and it is the honest
 * shape of a strategy that costs destroy, because it turns over the whole book every bar for a
 * small per-trade edge. Uses only `bars(2)`, so it sees nothing the live path would not.
 */
const oneBarMomentum: Strategy = {
  name: 'one-bar-momentum',
  warmupBars: 3,
  onBar: (view, position) => {
    const w = view.bars(2);
    if (w.length < 2) return [];
    const rising = w.close[1] > w.close[0];
    return ordersForTarget(position, rising ? 1 : -1, 'momentum');
  },
};

/** Flips long/short every `period` bars — a deliberately high-turnover cost probe. */
function flipFlop(period: number, size = 1): Strategy {
  return {
    name: `flip-${period}`,
    warmupBars: 2,
    onBar: (view, position) => {
      const cycle = Math.floor(view.barsSeen / period) % 2;
      const target = cycle === 0 ? size : -size;
      return ordersForTarget(position, target, 'flip');
    },
  };
}

describe('the market view', () => {
  it('cannot be asked for a future bar, at the type level', () => {
    // The whole design, asserted by the compiler rather than by a runtime guard: a runtime check
    // can be bypassed and a convention can be forgotten, but a call that does not typecheck
    // cannot ship.
    //
    // The expressions live inside a function that is **never called**. `@ts-expect-error`
    // suppresses the compile error but does not stop the line executing, so calling them would
    // throw at runtime and test the wrong thing entirely — the point is that the code does not
    // compile, not that it fails when run.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const neverCalled = (view: MarketView) => {
      // @ts-expect-error — no method takes a timestamp, so "give me bar t+1" is unwritable.
      view.barAt(999);
      // @ts-expect-error — the clock is readable, never settable.
      view.now = 999;
      // @ts-expect-error — next-bar access is engine-only and absent from the interface.
      view.nextBarForExecution();
      // @ts-expect-error — there is no whole-series accessor to index past the clock.
      view.allBars();
    };

    // And the same fact at the value level, so the guarantee is visible without reading types.
    const view: MarketView = new ReplayMarketView('BTC/USDT', '1h', candles(ramp(10)));
    const surface = new Set([
      ...Object.keys(view),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(view)),
    ]);
    for (const method of ['bars', 'latest', 'feature', 'features']) {
      expect(surface.has(method)).toBe(true);
    }
    // Every method a strategy can reach takes a count or an id — never a time.
    expect(view.bars.length).toBe(1);
    expect(view.latest.length).toBe(0);
  });

  it('shows only bars up to the clock', () => {
    const view = new ReplayMarketView('BTC/USDT', '1h', candles(ramp(10)));
    view.advance({});
    view.advance({});
    view.advance({});

    expect(view.barsSeen).toBe(3);
    const w = view.bars(100);
    expect(w.length).toBe(3);
    // The most recent visible close is the third bar's, not the tenth.
    expect(w.close[w.length - 1]).toBe(102);
  });

  it('grows the visible window one bar at a time and never skips', () => {
    const view = new ReplayMarketView('BTC/USDT', '1h', candles(ramp(6)));
    const seen: number[] = [];
    while (view.advance({})) seen.push(view.latest().close);
    expect(seen).toEqual([100, 101, 102, 103, 104, 105]);
  });

  it('refuses to be read before the clock starts', () => {
    const view = new ReplayMarketView('BTC/USDT', '1h', candles(ramp(5)));
    expect(() => view.latest()).toThrow(/before the clock started/i);
  });

  it('stops advancing at the end of the data', () => {
    const view = new ReplayMarketView('BTC/USDT', '1h', candles(ramp(3)));
    expect(view.advance({})).toBe(true);
    expect(view.advance({})).toBe(true);
    expect(view.advance({})).toBe(true);
    expect(view.advance({})).toBe(false);
  });
});

describe('the execution simulator', () => {
  const bar = {
    openTime: 0,
    closeTime: 3_600_000,
    open: 100,
    high: 102,
    low: 98,
    close: 101,
    volume: 1000,
  };

  it('fills a market order at the next bar\'s open, not the decision close', () => {
    // Filling at the decision bar's close is the most flattering backtest bug there is: it hands
    // the strategy a price that existed at the instant it decided, which no venue offers.
    const fill = new ExecutionSimulator(FRICTIONLESS).simulate(
      { side: 'BUY', type: 'MARKET', quantity: 1 },
      bar,
      99,
    )!;
    expect(fill.price).toBeCloseTo(100, 10);
    expect(fill.referencePrice).toBe(99);
  });

  it('makes a buy pay up and a sell receive less', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    const buy = sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 1 }, bar, 100)!;
    const sell = sim.simulate({ side: 'SELL', type: 'MARKET', quantity: 1 }, bar, 100)!;

    expect(buy.price).toBeGreaterThan(bar.open);
    expect(sell.price).toBeLessThan(bar.open);
  });

  it('charges more for a larger share of the bar\'s volume', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    const small = sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 1 }, bar, 100)!;
    const large = sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 40 }, bar, 100)!;

    // Participation-based, not a flat constant: a flat slippage figure makes size free, which is
    // how a strategy backtests brilliantly at a size the market could never absorb.
    expect(large.price).toBeGreaterThan(small.price);
    expect(large.slippageCost / large.quantity).toBeGreaterThan(small.slippageCost / small.quantity);
  });

  it('caps a fill at its share of the bar and reports the partial', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    // 5% of 1000 is 50; asking for 200 must not fill 200.
    const fill = sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 200 }, bar, 100)!;
    expect(fill.quantity).toBeCloseTo(50, 10);
    expect(fill.partial).toBe(true);
  });

  it('declines entirely when the bar has no volume', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    expect(sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 1 }, { ...bar, volume: 0 }, 100)).toBeNull();
  });

  it('fills a limit order only if the bar traded through it', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    const reached = sim.simulate({ side: 'BUY', type: 'LIMIT', quantity: 1, limitPrice: 99 }, bar, 100);
    const missed = sim.simulate({ side: 'BUY', type: 'LIMIT', quantity: 1, limitPrice: 90 }, bar, 100);

    expect(reached!.price).toBe(99);
    expect(missed).toBeNull();
  });

  it('charges the maker fee on a resting order and no spread', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    const limit = sim.simulate({ side: 'BUY', type: 'LIMIT', quantity: 1, limitPrice: 99 }, bar, 100)!;
    const market = sim.simulate({ side: 'BUY', type: 'MARKET', quantity: 1 }, bar, 100)!;

    expect(limit.spreadCost).toBe(0);
    expect(limit.fee).toBeLessThan(market.fee);
  });

  it('accrues funding per window held, not once at the end', () => {
    const sim = new ExecutionSimulator(REALISTIC_COSTS);
    const oneWindow = sim.fundingFor(10_000, 0, 8 * 3_600_000, 'BUY');
    const threeWindows = sim.fundingFor(10_000, 0, 24 * 3_600_000, 'BUY');

    expect(threeWindows).toBeCloseTo(oneWindow * 3, 8);
    // A short receives what a long pays.
    expect(sim.fundingFor(10_000, 0, 8 * 3_600_000, 'SELL')).toBeCloseTo(-oneWindow, 10);
  });

  it('charges nothing under the frictionless model', () => {
    const fill = new ExecutionSimulator(FRICTIONLESS).simulate(
      { side: 'BUY', type: 'MARKET', quantity: 10 },
      bar,
      100,
    )!;
    expect(fill.fee).toBe(0);
    expect(fill.spreadCost).toBe(0);
    expect(fill.slippageCost).toBe(0);
    expect(fill.impactCost).toBe(0);
    expect(fill.price).toBeCloseTo(100, 10);
  });
});

describe('the engine', () => {
  const run = (strategy: Strategy, closes: number[], costs = REALISTIC_COSTS, volume = 1000) =>
    new BacktestEngine({ initialEquity: 100_000, costs }).run({
      strategy,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      candles: candles(closes, { volume }),
    });

  it('holds the strategy to its warmup before asking for anything', () => {
    let firstCall = -1;
    const spy: Strategy = {
      name: 'spy',
      warmupBars: 50,
      onBar: (view) => {
        if (firstCall === -1) firstCall = view.barsSeen;
        return [];
      },
    };
    run(spy, ramp(100));
    expect(firstCall).toBe(50);
  });

  it('does not fill an order decided on the final bar', () => {
    // There is no next bar for it to execute in, and inventing one would be executing against
    // data that does not exist.
    const lastBarOnly: Strategy = {
      name: 'last-bar',
      warmupBars: 2,
      onBar: (view, position) => (view.barsSeen === 20 ? ordersForTarget(position, 1) : []),
    };
    const result = run(lastBarOnly, ramp(20));
    expect(result.trades).toHaveLength(0);
    expect(result.finalEquity).toBe(result.initialEquity);
  });

  it('records a closed trade with the costs it actually incurred', () => {
    const result = run(flipFlop(5), ramp(40, 100, 2));
    expect(result.trades.length).toBeGreaterThan(0);

    for (const t of result.trades) {
      expect(t.exitAt).toBeGreaterThan(t.entryAt);
      expect(t.fees).toBeGreaterThan(0);
      expect(t.spreadCost).toBeGreaterThan(0);
      // Net PnL is gross minus the costs recorded on the same trade.
      expect(t.pnl).toBeLessThan((t.exitPrice - t.entryPrice) * t.quantity + t.fees);
    }
  });

  it('treats a reversal as a close plus an open, not one continuous position', () => {
    // Merging them would silently halve the trade count and make every per-trade statistic wrong.
    const result = run(flipFlop(4), ramp(40, 100, 1));
    const sides = new Set(result.trades.map((t) => t.side));
    expect(result.trades.length).toBeGreaterThan(3);
    expect(sides.has('BUY')).toBe(true);
    expect(sides.has('SELL')).toBe(true);
  });

  it('produces one equity point per simulated bar', () => {
    const result = run(buyAndHold, ramp(30));
    expect(result.equityCurve).toHaveLength(result.barsSimulated);
    expect(result.barsSimulated).toBe(30);
  });

  it('marks a frictionless run as frictionless, so a report cannot hide it', () => {
    expect(run(buyAndHold, ramp(30), FRICTIONLESS).frictionless).toBe(true);
    expect(run(buyAndHold, ramp(30), REALISTIC_COSTS).frictionless).toBe(false);
  });

  it('counts liquidity rejections rather than silently skipping them', () => {
    const huge: Strategy = {
      name: 'too-big',
      warmupBars: 2,
      onBar: (_v, position) => (position.quantity === 0 ? ordersForTarget(position, 1) : []),
    };
    // A bar with almost no volume: the order cannot fill at all.
    const result = new BacktestEngine({ initialEquity: 100_000, costs: REALISTIC_COSTS }).run({
      strategy: huge,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      candles: candles(ramp(20), { volume: 0 }),
    });
    expect(result.rejectedForLiquidity).toBeGreaterThan(0);
    expect(result.trades).toHaveLength(0);
  });

  it('charges funding on a position held across bars', () => {
    const result = run(buyAndHold, ramp(100));
    expect(result.totalFunding).toBeGreaterThan(0);
  });

  it('charges no funding when nothing is held', () => {
    const flat: Strategy = { name: 'flat', warmupBars: 2, onBar: () => [] };
    expect(run(flat, ramp(50)).totalFunding).toBe(0);
  });
});

/**
 * **The milestone's acceptance criterion.**
 *
 * A backtest that fills at the close for free is a random number generator with a nice chart.
 * These tests assert that the difference is not cosmetic.
 */
describe('costs change the answer', () => {
  const runBoth = (strategy: Strategy, closes: number[], volume = 1000) => {
    const make = (costs: typeof REALISTIC_COSTS) =>
      new BacktestEngine({ initialEquity: 100_000, costs }).run({
        strategy,
        symbol: 'BTC/USDT',
        timeframe: '1h',
        candles: candles(closes, { volume }),
      });
    return { free: make(FRICTIONLESS), real: make(REALISTIC_COSTS) };
  };

  it('turns a profitable high-turnover strategy into a losing one', () => {
    // The acceptance criterion, as a number. A strategy with a small genuine per-trade edge and
    // very high turnover makes money for free and loses it once it pays to trade.
    //
    // The series alternates by **0.3%**, which is the point of the fixture: the per-trade edge
    // has to be comparable to the round-trip cost for the demonstration to mean anything. A 3%
    // zigzag stays profitable through realistic friction and would have shown nothing — checked,
    // rather than assumed, by sweeping the amplitude: 3% nets +459 after costs, 1% nets +68, and
    // 0.3% is where an apparently excellent strategy flips to a loss.
    const zigzag = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 100 : 100.3));
    const { free, real } = runBoth(oneBarMomentum, zigzag);

    expect(free.finalEquity).toBeGreaterThan(free.initialEquity);
    expect(real.finalEquity).toBeLessThan(free.finalEquity);
    expect(real.finalEquity).toBeLessThan(real.initialEquity);

    // And the gap is material, not a rounding difference.
    const freePnl = free.finalEquity - free.initialEquity;
    const realPnl = real.finalEquity - real.initialEquity;
    expect(freePnl - realPnl).toBeGreaterThan(Math.abs(freePnl) * 0.5);
  });

  it('reports where the money went, rather than one lump', () => {
    const { real } = runBoth(flipFlop(4), ramp(200, 100, 0.05));

    expect(real.totalFees).toBeGreaterThan(0);
    expect(real.totalSpreadCost).toBeGreaterThan(0);
    expect(real.totalSlippageCost).toBeGreaterThan(0);
    expect(real.totalImpactCost).toBeGreaterThan(0);
    // Each is separately attributable, so it is possible to tell a fee problem from a size
    // problem — they have completely different fixes.
    const parts = real.totalFees + real.totalSpreadCost + real.totalSlippageCost + real.totalImpactCost;
    expect(parts).toBeGreaterThan(0);
  });

  it('costs a high-turnover strategy far more than a low-turnover one', () => {
    const fast = runBoth(flipFlop(2), ramp(200, 100, 0.05)).real;
    const slow = runBoth(flipFlop(50), ramp(200, 100, 0.05)).real;

    expect(fast.trades.length).toBeGreaterThan(slow.trades.length);
    expect(fast.totalFees).toBeGreaterThan(slow.totalFees * 3);
  });

  it('makes size expensive, so a strategy cannot scale for free', () => {
    const small = runBoth(flipFlop(10, 1), ramp(200, 100, 0.05), 1000).real;
    const large = runBoth(flipFlop(10, 30), ramp(200, 100, 0.05), 1000).real;

    // Thirty times the size costs more than thirty times the slippage, because participation
    // and impact both rise with it.
    const perUnitSmall = small.totalSlippageCost / Math.max(1, small.trades.length);
    const perUnitLarge = large.totalSlippageCost / Math.max(1, large.trades.length) / 30;
    expect(perUnitLarge).toBeGreaterThan(perUnitSmall);
  });

  it('leaves a buy-and-hold strategy almost untouched, which is the sanity check', () => {
    // Costs should bite turnover, not existence. If a single round trip were also devastating,
    // the model would be miscalibrated rather than realistic.
    const { free, real } = runBoth(buyAndHold, ramp(200, 100, 0.5));
    const freePnl = free.finalEquity - free.initialEquity;
    const realPnl = real.finalEquity - real.initialEquity;

    expect(realPnl).toBeLessThan(freePnl);
    expect(realPnl).toBeGreaterThan(freePnl * 0.8);
  });

  it('cannot manufacture a profit from a driftless random walk', () => {
    const { real } = runBoth(flipFlop(7), walk(300, 11));
    // No edge and real costs: the only honest outcome is a loss.
    expect(real.finalEquity).toBeLessThan(real.initialEquity);
  });
});
