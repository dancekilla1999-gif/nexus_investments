# Backtesting & Strategy Validation Architecture

## 0. The rule this document exists to enforce

**No trading strategy — rule-based or ML — is ever connected to a live Managed Account
(`docs/10-managed-accounts-architecture.md`) or a real-money signal feed without a passing,
stored `BacktestResult`, followed by a minimum observation window trading paper/testnet
capital.** "I tested it and it looked good" is not a gate; a stored, immutable, re-runnable
result is. This document defines that pipeline.

## 1. Pipeline

```
Historical Data Engine ──▶ Backtest Runner ──▶ BacktestResult (immutable)
   (top-25 pairs,               (walk-forward,           │
    point-in-time,               realistic fees/          ▼
    survivorship-bias-free)      slippage, no             Promotion Gate
                                  look-ahead)              (must clear a documented
                                                            bar + forward-test window)
                                                                  │
                                                                  ▼
                                                     Paper/testnet forward run (live data,
                                                     simulated fills) — minimum N days
                                                                  │
                                                                  ▼
                                                     Eligible to trade a Managed Account,
                                                     starting at reduced size, only in
                                                     PLATFORM_MODE=sandbox until legal
                                                     review clears real capital.
```

## 2. Historical Data Engine

- **Pair universe:** the Top Markets Engine (`docs/07-ai-signal-architecture.md §9`) already
  computes "top 25 by volume/market cap/liquidity" *dynamically, as of today*. A backtest must
  use the top-25 set **as it existed at each point in historical time**, not today's list
  applied retroactively — using today's winners to backtest the past is survivorship bias and
  will produce numbers that cannot repeat live. `BacktestRun.pairUniverseSnapshotJson` stores
  the exact, dated pair list the run actually used, so every result is reproducible and
  auditable.
- **Data source:** OHLCV candles per pair/timeframe, behind the same `MarketDataProvider`
  interface `docs/07 §8` already establishes — swapping providers never touches the backtest
  engine's code.

| Need | Suggested provider | Free tier | Notes |
|---|---|---|---|
| Live top-N ranking (market cap, volume) | CoinMarketCap API (already used, `docs/07 §8`) | Yes (rate-limited) | Keep for ranking — it's what it's good at. |
| Historical OHLCV for backtesting | **Binance public REST klines API** (recommended default) | Yes, no key required, years of history | CoinMarketCap's *historical* OHLCV endpoints require a paid Enterprise-tier plan — not justified for MVP. Binance's klines are free, deep, and cover essentially all top-25 pairs against USDT. |
| Cross-check / gap-fill | CryptoCompare historical API | Free tier available | Useful for a pair that never traded on Binance, or for independent verification of a suspiciously good backtest. |

  This is an intentional, documented provider split (ranking vs. history) — not an
  inconsistency. Both sit behind the same abstraction, so it's a config change either way.
- Candles are cached (not re-fetched per backtest run) in a dedicated historical store,
  separate from the live `market_data` table used by the Trading module, so a multi-year
  backtest data pull never contends with live trading read/write load.

## 3. Backtest Runner

- **Walk-forward, not a single train/test split.** The historical range is divided into
  rolling windows; the strategy is fit (if it has fittable parameters at all — most v1
  strategies are fixed-rule, see `docs/07 §4`) on window *N*, then evaluated strictly on
  window *N+1*, which it never saw. This is the standard defense against overfitting a
  strategy to noise in one static historical period.
- **No look-ahead.** The simulator only ever sees data up to the simulated "current" candle
  close when making a decision — enforced structurally by the data-feed interface (it cannot
  return future candles), not just by convention.
- **Realistic execution assumptions**, pulled from the same config the live system uses, not
  optimistic defaults:
  - Trading fees from the real `FeeSchedule` (`docs/03-database-architecture.md`).
  - A slippage model (basis points, configurable per pair by typical liquidity) applied against
    every simulated fill — a backtest with zero slippage is a backtest that lies.
  - Order latency is not modeled as instant; a small simulated delay between decision and fill
    is applied for market orders.
- **`BacktestRun`** records the exact strategy version, date range, pair universe snapshot,
  fee/slippage assumptions, and a status. **`BacktestResult`** (one per completed run,
  insert-only, same convention as `signal_results` — `docs/07 §6`) records: total trades, win
  rate, average R, max drawdown, Sharpe/Sortino, and breakdowns by asset/timeframe/regime.
  There is no code path to edit a `BacktestResult` after the fact — a bad result gets a new run
  with a fixed strategy, never a hand-edited number.

## 4. Promotion gate (the actual enforcement)

A `TradingStrategy` version has a `promotionStatus`
(`BACKTESTING → PAPER_TRADING → LIVE_ELIGIBLE`) and only moves forward when:

1. **BACKTESTING → PAPER_TRADING** requires a `BacktestResult` meeting a documented minimum
   bar (positive expectancy across the full walk-forward run, max drawdown at or below the
   platform's own risk ceiling from `docs/10 §4`, and a minimum trade-count sample size so a
   good result isn't just luck from 8 trades). The bar itself is config, versioned and
   admin-editable, never a hardcoded gut-feel number buried in code.
2. **PAPER_TRADING → LIVE_ELIGIBLE** requires the strategy to run against **live market data
   with simulated (paper) fills** — no real capital — for a minimum observation window (default
   30 days, admin-configurable), and its live paper performance must not diverge materially
   from what the backtest predicted (a large divergence is itself a signal the backtest
   overfit or the market regime shifted — it blocks promotion rather than being explained
   away).
3. **`LIVE_ELIGIBLE` is necessary, not sufficient**, to actually trade a Managed Account with
   real capital — that additionally requires `PLATFORM_MODE=live` (which itself requires the
   compliance attestation, `docs/02-system-architecture.md §4`) and, per `docs/10 §1`, a
   completed legal review for discretionary trading specifically. Three independent gates,
   not one — a bug or bypass in any single check cannot alone put real money behind an
   unvalidated strategy.

## 5. What ships in this delivery vs. later

This entire engine depends on Trading (MVP4) for realistic fill simulation against a real
order model, and the Signal/Indicator Engine (MVP6) for anything a "strategy" would actually
be built from. **Nothing in this document is implemented as running code yet** — it is the
design the `TradingStrategy` / `BacktestRun` / `BacktestResult` tables already added to the
schema (`docs/10 §9`) exist to support, so MVP11 is additive migrations and new services, not
a redesign. See `docs/09-roadmap.md §MVP11` for acceptance criteria.
