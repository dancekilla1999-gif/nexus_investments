# AI Signal Architecture

## 1. What this module is not

Not a random Buy/Sell generator, not a "guaranteed profit" system, not a black box. Every
signal is a **structured, explainable, falsifiable claim** with a confidence score and a
permanent, immutable performance record. Language like "100% accurate" or "guaranteed" is
banned at the type level — `Signal.confidence` is a bounded float, there is no
`Signal.guaranteed` field, and the copy-review checklist in `08-ui-ux-architecture.md` forbids
guarantee language in any signal-adjacent UI string.

## 2. Pipeline

```
Market Data Service ─┐
                      ├─▶ Indicator Engine ─▶ Signal Engine ─▶ signals table
On-Chain Service ─────┤        (100+           (rule/ML combination
News Service ─────────┤      indicators,        + macro/news context
Macro Service ────────┘      §3 below)           adjustment, §4)
                                                        │
                                                        ▼
                                              Knowledge Engine (§5)
                                            generates the human-readable
                                              "Reasoning" explanation
                                                        │
                                                        ▼
                                         Signal Performance tracker (§6)
                                        writes to signal_results as outcomes
                                             become known — immutable
```

## 3. Indicator Engine (100+ indicators)

Implemented as a library of pure functions `Indicator<Input, Output>` over OHLCV series,
registered in a catalog (`indicators` table = catalog metadata, not per-candle output — the
computed values are ephemeral/cached in Redis per (symbol, timeframe), not persisted per-row,
to avoid an unbounded time-series table; only signals and their supporting indicator snapshot
are persisted).

Categories and representative members (full list in
`apps/api/src/signals/indicators/registry.ts` as it's built out in MVP6):

- **Trend:** SMA, EMA, WMA, VWMA, HMA, Ichimoku Cloud, Supertrend, ADX, Parabolic SAR, DEMA,
  TEMA, KAMA, Aroon, Vortex, Linear Regression Slope, ...
- **Momentum:** RSI, MACD, Stochastic (%K/%D), StochRSI, CCI, Williams %R, ROC, MFI, TSI,
  Ultimate Oscillator, Awesome Oscillator, ...
- **Volatility:** Bollinger Bands, ATR, Keltner Channels, Donchian Channels, Standard
  Deviation, Historical Volatility, Chaikin Volatility, ...
- **Volume:** OBV, VWAP, CMF, A/D Line, Volume Profile, Volume Oscillator, Ease of Movement, ...
- **Market structure:** support/resistance clustering, liquidity zones, swing high/low
  detection, break of structure (BOS), change of character (CHoCH), order blocks, fair value
  gaps.
- **Candlestick patterns:** engulfing, hammer/hanging man, shooting star, doji family,
  morning/evening star, three white soldiers/black crows, harami, ...

Each indicator is independently unit-testable against known reference values (fixture-based
tests, §`09-roadmap.md` MVP6 acceptance criteria) — we do not ship an indicator we haven't
verified against a known-good calculation.

## 4. Signal Engine — combination logic

A signal is produced by a **rules + weighted-scoring model** (v1) that combines: trend-following
indicator confluence, momentum confirmation, volatility-adjusted stop placement, market
structure context (regime: trending/ranging/volatile), and a macro/news confidence *modifier*
(not an independent signal source — it adjusts confidence on a technical setup, per PRD
example: "bullish technical setup, but major macro event approaching, confidence reduced").
A v2 upgrade path to a trained ML ranking model (gradient-boosted trees over the same feature
set, or a sequence model) is designed for but not required for MVP6 — the `signals` table's
`model_version` column exists specifically so v1 (rules) and v2 (ML) outputs are comparably
tracked in the same performance system.

Every `Signal` row carries:

```
asset, timeframe, direction (LONG/SHORT), entryZoneLow, entryZoneHigh, stopLoss,
takeProfit1/2/3, riskRewardRatio, confidence (0-1), strength, marketRegime,
supportingIndicators (jsonb snapshot), macroContext, newsContext, reasoning (text),
createdAt, expiresAt, modelVersion
```

## 5. Knowledge Engine

A structured, versioned knowledge base (`apps/api/src/signals/knowledge/`) of our own
technical-analysis, price-action, market-structure, risk-management, and macro concept
definitions — written in-house or sourced from public-domain/licensed material, **never**
reproduced verbatim from copyrighted texts. Used by the AI assistant/reasoning generator as
grounding context (retrieval, not fine-tuning) so a signal's "Reasoning" text cites *which*
concept and *which* observed indicator state produced it — e.g. "RSI(14) bullish divergence
+ price above 200 EMA + BOS on 4H" rather than free-form prose.

## 6. Signal Performance (immutable, no cherry-picking)

Every signal, once its timeframe/expiry elapses (or TP/SL is hit, whichever first), gets
exactly one `signal_results` row: outcome (`TP1_HIT`/`TP2_HIT`/`TP3_HIT`/`SL_HIT`/`EXPIRED`),
realized R multiple, and timestamps. `signal_results` rows are insert-only, same audit
guarantee as `03-database-architecture.md §5`. Aggregate stats (win rate, average R/R, max
drawdown, breakdown by asset/timeframe/strategy/regime) are **computed views over this table**,
never a separately-editable "stats" record — so there is no code path that can show a number
that didn't come from real recorded outcomes.

## 7. AI Portfolio Assistant

Analyzes a user's *own* portfolio (holdings from `balances`, `orders`, `trades`) for
concentration, correlation, volatility exposure, and drawdown, and answers natural-language
questions grounded in: the user's own data, live platform market data, the news/macro engine,
and the Knowledge Engine — never invented figures. If a question needs data the platform
doesn't have, the assistant says so explicitly rather than fabricating an answer (PRD §27,
non-negotiable). It never issues personalized guarantees of returns (PRD §15).

## 8. News & Macro Engine

`news` module ingests from a pluggable set of provider adapters (see cost table below) and
tags each item: `importance` (low/medium/high), `affectedAssets` (array), `sentiment`
(bullish/bearish/neutral), `confidence`, `publishedAt`. `macro` module maintains a calendar of
scheduled releases (CPI, PPI, GDP, NFP, FOMC, rate decisions) plus ad-hoc events (exchange
incidents, token unlocks, regulatory actions), each similarly tagged. The Signal Engine reads
both as **context**, adjusting confidence, not as a second independent "signal."

| Need | Suggested provider | Free tier | Notes |
|---|---|---|---|
| Crypto news | CryptoPanic API | Yes (rate-limited) | Aggregator, has a sentiment field already |
| Macro calendar | Trading Economics API or Finnhub | Limited free tier | Finnhub has a generous free tier for calendar + basic news |
| On-chain analytics | CoinGecko / CoinMarketCap (market cap, volume, ranking) | Yes (CoinGecko generous) | For Top Markets Engine, §9 |
| On-chain (whales, flows, TVL) | DefiLlama (TVL, free, no key), Glassnode/CryptoQuant (whale/exchange flow — paid, has limited free) | Partial | Start with DefiLlama (free) + CoinGecko; add Glassnode/CryptoQuant behind the same `OnChainProvider` interface when budget allows |

All behind provider-interface abstractions (`NewsProvider`, `MacroProvider`,
`OnChainProvider`, `MarketDataProvider`) so a paid upgrade never touches calling code.

## 9. Top Markets / Market Scanner Engine

Not a hardcoded pair list. A scheduled job ranks all available markets by a composite of
24h volume, market cap, and liquidity depth (from the `market-data` module), refreshes the
"Top N" set (N configurable, default 25) on an interval, and that set drives what the Signal
Engine actively scans. `markets.isScanned` is a derived flag written by this job, not a manual
toggle.

## 10. Guardrails (enforced, not just written down)

- No UI string may contain "guaranteed", "100% accurate", "risk-free", or equivalents —
  lint-checked via a banned-phrase test over all frontend copy files (`09-roadmap.md §MVP6`
  acceptance criteria).
- Every signal display shows confidence **and** the live, real win-rate/R:R stats for that
  asset/timeframe/strategy bucket, side by side — never confidence alone.
- Signals are informational; the platform's own AI text explicitly disclaims "not financial
  advice" the same way genuine research platforms do — set once in a shared UI component,
  not left to per-page discipline.
