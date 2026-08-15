# AI Trading Intelligence — Data & Feature Architecture

> Part 1 of 3. Part 2 is `18-ai-ml-architecture.md` (models, training, validation, backtesting).
> Part 3 is `19-ai-signal-and-auto-trading.md` (signal pipeline, risk, execution, auto-trading).
>
> **This supersedes `07-ai-signal-architecture.md`**, which described a rules-plus-weights signal
> engine reading indicators directly off live candles. That design is not wrong so much as
> unfalsifiable: with no point-in-time data store and no separation between what a model saw and
> what actually happened, there is no way to prove out-of-sample performance. Doc 07 remains for
> its guardrails (§10) and its ban on guarantee language, both of which carry forward unchanged.

---

## 0. The premise, stated honestly

The goal is **not** a model that predicts the market. It is a system that estimates the
probability of a small number of well-defined outcomes, knows how wide its own error bars are,
and declines to act when the edge does not clear costs. Everything below follows from three
uncomfortable facts:

1. **Financial returns are mostly noise.** A genuinely good directional model on liquid crypto
   is in the 52–56% accuracy range on a balanced label, not 80%. Any pipeline that reports much
   more has a leak in it, and the leak is usually silent. Most of the engineering below is leak
   prevention, not modelling.

2. **The backtest is the product's biggest liability.** It is trivially easy to produce a
   beautiful equity curve that is pure artefact — from lookahead, from survivorship, from
   fitting on the test set, or simply from trying 400 configurations and reporting the best.
   The last one is the most dangerous because every individual step looks legitimate.

3. **The expensive part is data, not machine learning.** Gradient boosting on tabular features
   is a solved, commodity technique. Point-in-time-correct, gap-free, revision-aware market and
   macro data is neither cheap nor easy, and it is what actually determines whether the output
   means anything. Budget accordingly.

The system is therefore built so that **the honest answer is the cheap one**: NO TRADE requires
no data quality, no model agreement and no liquidity; it is the default the pipeline falls back
to whenever any stage is unsure. Producing a signal is what must be earned.

---

## 1. Service topology

The engine is not one service and not one prompt. It is a set of processes with different
runtimes, different scaling profiles and different failure semantics.

```
┌─ Ingestion (Node/TS, one process per provider class) ───────────────────┐
│  market-data · derivatives · onchain · news · macro · social            │
│  Writes raw, immutable, timestamped records. Does no interpretation.    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─ Storage ───────────────────────────────────────────────────────────────┐
│  TimescaleDB (candles, funding, OI, book snapshots, trades)             │
│  PostgreSQL (news, macro releases, model registry, signals — existing)  │
│  Object store (Parquet: training sets, backtest artefacts, model files) │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─ Feature layer (Rust or TS, ONE implementation) ────────────────────────┐
│  indicator kernels · market structure · order flow · regime             │
│  Same binary serves backtest replay and live inference. Non-negotiable. │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─ Research (Python, offline, no production traffic) ─────────────────────┐
│  labelling · training · purged CV · walk-forward · model selection      │
│  Emits: ONNX model file + feature contract + validation report          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─ Inference (Node + onnxruntime, low latency, stateless) ────────────────┐
│  per-model scoring → ensemble → probability → EV                        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─ Decision (Node/TS) ────────────────────────────────────────────────────┐
│  portfolio optimiser · risk engine · signal writer · execution          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why Python for training and Node for serving.** The research ecosystem (LightGBM, scikit-learn,
`mlfinlab`-style purged CV, SHAP) has no real equivalent in TypeScript, and reimplementing it
would be a large amount of subtly-wrong code. But the platform's money paths are already in
NestJS and must stay there. The seam is **ONNX**: Python trains and exports, Node loads and
scores. The feature vector crossing that seam is a versioned contract, validated on load.

**Why the feature layer is one implementation, not two.** The single most common way a
quantitative system fails in production is *train/serve skew* — the backtest computed RSI over
closed candles while the live path computed it over a forming candle, and the model is now
seeing a distribution it was never trained on. Writing indicators twice guarantees this
eventually. So the backtest does not have its own indicator code: it replays historical data
through the *same* feature binary the live path uses, and a test asserts that replaying a
recorded live session reproduces the recorded feature vectors bit-for-bit.

---

## 2. Data architecture

### 2.1 The property everything else depends on: point-in-time correctness

Every stored record carries **two** timestamps:

| Field | Meaning |
|---|---|
| `eventTime` | when the thing happened in the world (candle close, release time, block time) |
| `ingestTime` | when *we* first could have known it |

All training and backtesting queries filter on `ingestTime <= t`, never on `eventTime <= t`.

This is not pedantry. Three concrete cases where the distinction is the whole ballgame:

- **Macro revisions.** US GDP and NFP are revised, sometimes substantially, for months. A
  provider's "history" endpoint returns the *revised* series. Train on that and the model learns
  from numbers that did not exist on the day it is pretending to trade. Macro data must be stored
  as an **append-only series of vintages** — each release and each revision is a new row — and
  the backtest reads the vintage that was current at `t`.
- **Late-arriving on-chain data.** Exchange-flow and whale-transaction datasets are often
  published with hours of lag and are back-filled. `ingestTime` is the only honest cut-off.
- **Candle finality.** A 1h candle at 14:00 is not knowable until 15:00. Storing it under
  `eventTime = 14:00` and querying `eventTime <= 14:30` hands the model the future.

A backtest that ignores this produces results that are not merely optimistic — they are
uncorrelated with what live trading will do.

### 2.2 Storage choice

**TimescaleDB** (a PostgreSQL extension) for all time series, alongside the existing Postgres
rather than instead of it. Reasoning: it is Postgres, so it inherits the operational knowledge,
backups, migrations and the Prisma connection the platform already has; hypertables and
continuous aggregates handle the write volume and the rollup queries; and there is no second
database technology to run. A dedicated column store (ClickHouse, QuestDB) is faster for full
scans and is the right answer if L2 order-book capture is switched on at scale — that decision
is deferred to §6, and the ingestion layer writes through a repository interface so it is a
swap rather than a rewrite.

Raw tick and L2 data, if captured, is **not** kept in the transactional database. It is written
to Parquet in object storage, partitioned by `(venue, symbol, date)`, and read by the research
process directly. Volume estimates in §6.

### 2.3 Categories, and what each is actually for

| Category | Content | Update | Honest assessment |
|---|---|---|---|
| **OHLCV** | 1m→1W across the scanned universe | 1m | Free, deep, reliable. The backbone. |
| **Trades** | Individual prints, aggressor side | stream | Free on public WS. Volume is large but manageable per-symbol. |
| **Order book** | L2 depth snapshots + deltas | stream | Free live; **historical L2 is expensive and rarely worth it early** (§6). |
| **Derivatives** | Funding, OI, liquidations, basis | 1m–8h | Free on exchange APIs. High signal-to-noise for crypto specifically. |
| **Options** | IV surface, skew, term structure, P/C | 1h | Deribit public API covers BTC/ETH well. Thin elsewhere. |
| **On-chain** | TVL, active addrs, exchange flows, whales, unlocks | 10m–1d | TVL/addresses free (DefiLlama). **Flows and whale labelling are paid** and are the part with real edge. |
| **ETF / institutional** | Spot ETF creations/redemptions | 1d | Daily only, lagged. Useful as a slow regime input, not a trigger. |
| **Macro** | CPI, NFP, FOMC, DXY, yields, VIX, PMI | event | Vintage-stored (§2.1). Consensus-vs-actual matters far more than the level. |
| **News** | Crypto, financial, regulatory, exchange, security | stream | Needs clustering (§4) or it is worse than nothing. |
| **Social** | Aggregate sentiment indices | 5m–1h | Lowest quality tier, weakest weight, first to be dropped. |

### 2.4 Provider abstraction and reliability scoring

Every category sits behind an interface in the shape the platform already uses for
`MarketDataProvider` and `MarkProvider`:

```ts
interface DataProvider<TQuery, TRecord> {
  readonly key: string;
  readonly tier: 'primary' | 'secondary' | 'reference';
  fetch(query: TQuery): Promise<Observation<TRecord>[]>;
  health(): Promise<ProviderHealth>;
}

interface Observation<T> {
  value: T;
  eventTime: Date;
  ingestTime: Date;
  source: string;
  /** 0..1, computed — never configured by hand. See below. */
  reliability: number;
}
```

**Source reliability is measured, not declared.** A provider's score is a rolling function of:
uptime, latency percentiles, gap rate (missing intervals against the expected cadence),
disagreement with other providers on the same quantity, and revision frequency. It decays on
incident and recovers slowly. It is stored per (provider, category, symbol), because a source
can be excellent for BTC and useless for a mid-cap.

Where two providers disagree beyond a tolerance on a quantity that should be identical, the
value is **not** silently averaged. It is flagged, the disagreement is recorded, and the data
quality score for that symbol drops — which flows through to the signal's `dataQuality` field
and, past a threshold, to NO TRADE. Averaging a disagreement hides exactly the situation you
most need to know about.

### 2.5 Data quality gate

Before any feature is computed, the bar's inputs pass a gate that checks: no missing candles in
the lookback window; no stale timestamps (same freshness discipline as `MarkRegistry`, judged on
the provider's own clock); no price outliers beyond an N-sigma move unconfirmed by a second
venue; book not crossed; spread within historical norms; volume not implausibly zero.

A failed gate does not produce a degraded signal. It produces **no signal**, and a recorded
reason. This is the first of several places where the system's default is inaction.

---

## 3. Feature architecture

### 3.1 Features are versioned, contract-checked artefacts

A feature is not "call the RSI function". It is a registry entry:

```ts
interface FeatureSpec {
  id: string;                    // 'rsi_14_1h'
  version: number;               // bump on ANY computation change
  inputs: InputSpec[];           // which series, which lookback
  warmupBars: number;            // bars before the value is valid at all
  compute: (w: Window) => number | null;
  nullPolicy: 'propagate' | 'zero' | 'last';
  category: FeatureCategory;
}
```

Two rules make the registry load-bearing rather than decorative:

- **A model records the exact feature ids and versions it was trained on.** At inference the
  vector is validated against that contract; a mismatch refuses to score rather than scoring
  something plausible-looking. Changing an indicator's computation without bumping its version
  is the single easiest way to silently break a production model, so the version is part of the
  hash the model registry stores.
- **`warmupBars` is enforced.** A 200-EMA is not a number for the first 200 bars, it is a
  wrong number. Emitting `null` and letting the null propagate to NO TRADE is correct; emitting
  a partial-window value is how a backtest gets a spurious edge at the start of every window.

### 3.2 The families, and the 100+ count

The count is a floor and it is easily met, but the categories matter more than the total.

**Trend (~20)** — SMA/EMA/WMA/HMA/VWMA/DEMA/TEMA/KAMA at multiple periods, ADX/+DI/−DI, Aroon,
Vortex, Parabolic SAR, Supertrend, Ichimoku (5 lines), linear-regression slope and R².

**Momentum (~18)** — RSI, StochRSI, Stochastic %K/%D, MACD (line/signal/histogram), CCI, MFI,
ROC, Williams %R, TSI, Ultimate, Awesome, Coppock, RSI divergence flags.

**Volatility (~15)** — ATR and ATR%, Bollinger (width, %B), Keltner, Donchian, realized vol at
several windows, Parkinson and Garman–Klass estimators, vol-of-vol, Chaikin volatility, the
ratio of short- to long-window realized vol (a regime input in its own right).

**Volume (~14)** — OBV, CMF, A/D, Chaikin oscillator, VWAP and distance from it (session and
anchored), volume z-score, volume-profile POC/VAH/VAL, ease of movement, volume-weighted
momentum.

**Market structure (~15)** — swing highs/lows, HH/HL/LH/LL sequence state, break of structure,
change of character, distance to nearest support and resistance in ATR units, support/resistance
strength by touch count, fair value gaps (count, nearest, size), order blocks, liquidity pools
above and below, imbalance zones.

**Order flow (~12, availability-gated)** — book imbalance at several depths, bid/ask slope,
aggressive buy/sell ratio, volume delta, cumulative volume delta and its divergence from price,
large-print count, absorption (price failing to move against heavy volume), depth-weighted mid,
realized spread, Kyle's lambda as a liquidity estimate.

**Derivatives (~12)** — funding (level, z-score, sign persistence), OI (level, change, and
crucially **change signed against price change** — rising price with rising OI is a different
state from rising price with falling OI), liquidation volume by side, liquidation clusters,
basis, futures premium, IV rank, 25-delta skew, term-structure slope, put/call ratio.

**On-chain (~10)** — exchange net flow z-score, stablecoin supply change, active addresses
trend, TVL change, whale transaction count, unlock proximity and size relative to float.

**Macro (~10)** — DXY and its momentum, 2y/10y yields and the curve, VIX level and change,
days-to-next-high-impact-event, surprise index (actual vs consensus, standardised), a
risk-on/risk-off composite.

**Statistical / cross-sectional (~15)** — log returns over many horizons, rolling skew and
kurtosis, Hurst exponent, autocorrelation at several lags, rolling beta to BTC, rolling
correlation to BTC/ETH/DXY/SPX, cross-sectional return rank within the universe, distance from
N-day high/low, z-scores of the above.

That is 140+ before multi-timeframe expansion.

### 3.3 Multi-timeframe, done without leaking

Each feature is computed on 1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W. The rule that keeps this honest:
**a higher-timeframe feature may only enter a lower-timeframe vector using the last
higher-timeframe bar that has closed.** At 14:05 the 4h feature set is the one from the 12:00
bar; the forming 16:00 bar does not exist. Implemented in the windowing layer, not left to
whoever assembles the vector.

Cross-timeframe agreement is then itself a feature — the signed count of timeframes aligned
bullish, the presence of conflict between the daily and the weekly, and so on. A model can learn
that 1H-bullish against 1D-bearish is a materially different setup from full alignment, which is
precisely the case the user's example calls out.

### 3.4 Feature store

Offline: Parquet, partitioned by `(symbol, timeframe, month)`, one row per bar, columns per
feature version. Built by the same binary as live, from `ingestTime`-filtered raw data.

Online: Redis, last-N windows per (symbol, timeframe), warm enough that inference needs no
database round-trip.

The invariant test: recompute a random historical day offline and compare against what was
recorded online that day. They must match exactly. When they do not, that is train/serve skew
and it is a production incident, not a rounding difference.

### 3.5 Regime detection

A separate, causal classifier over a small feature subset (trend strength, realized vol
percentile, breadth, correlation dispersion, liquidity) emitting the taxonomy asked for: Strong
Bull / Bull / Sideways / Bear / Strong Bear / Capitulation / Recovery, crossed with independent
volatility, liquidity and risk-on/off dimensions.

The critical constraint: **the regime classifier is fit only on data before `t`.** Fitting an HMM
or a clustering model on the full history and then labelling the past with it is one of the most
common and most flattering leaks available — it tells the backtest what kind of market it was in
before that was knowable. The rolling-refit version is much less impressive and is the only one
worth having.

Regime feeds the system in three places: as features, as a router selecting which strategy
family is eligible (§`19`), and as a reporting dimension so a strategy that only works in one
regime is visibly a strategy that only works in one regime.

---

## 4. News intelligence

Ingestion is the easy half. The two hard parts:

**Clustering, so 50 reprints are one event.** Pipeline: embed each item, cluster by cosine
similarity within a rolling time window, and keep the *earliest* member as the event timestamp —
later reprints add corroboration weight but do not create a new event and never move the clock.
Without this, a widely-syndicated story looks like a sustained wave of independent news and any
sentiment aggregate becomes a popularity measure of newswires.

**Novelty vs. repetition.** A cluster carries a novelty score against the preceding window. The
tenth article about an ETF filing is not new information and should not move a feature that the
first one moved.

Each cluster is scored by an LLM into a **structured** record — asset, category, importance,
sentiment, confidence, expected horizon — with the model constrained to a schema and required to
cite the span it drew each field from. The LLM's job here is classification and extraction, not
prediction. It does not emit a trading opinion, and its output enters the pipeline as features
alongside everything else, where it must earn its weight out-of-sample like any other input.

Prompts and model identifiers are versioned; a changed prompt is a changed feature version,
because it is.

---

## 5. Required data providers

Ordered by what actually blocks progress. "Blocking" means the component cannot be built
honestly without it.

| # | Need | Recommended | Cost/mo | Blocking? |
|---|---|---|---|---|
| 1 | Historical + live OHLCV, trades, funding, OI, liquidations | **Binance / Bybit / OKX public APIs** | Free | No — free and sufficient |
| 2 | Multi-venue normalisation, one integration | CCXT (self-host) | Free | No |
| 3 | Options IV / skew / term structure | **Deribit public API** | Free | No, for BTC/ETH only |
| 4 | TVL, protocol data | **DefiLlama** | Free | No |
| 5 | Macro releases **with consensus and vintages** | **Trading Economics** or FRED + a calendar feed | $100–500 | **Yes** for the macro engine |
| 6 | News firehose with timestamps | CryptoPanic + Benzinga/Finnhub | $0–300 | Partly |
| 7 | Exchange flows, whale labelling | **Glassnode / CryptoQuant / Nansen** | $300–1500 | **Yes** for a real on-chain engine |
| 8 | ETF creations/redemptions | Farside (scrape) or a paid terminal | $0–1000 | No |
| 9 | Historical L2 order book | Tardis.dev | $500–2000+ | **Yes** for order-flow *models* |
| 10 | Social sentiment | LunarCrush / Santiment | $100–500 | No — lowest tier |

**The honest recommendation.** Build Phase 1 entirely on rows 1–4, which are free and cover
OHLCV, derivatives, options for the two assets that matter most, and basic on-chain. That is
enough for a genuine, testable system. Add row 5 when the macro engine is next, and row 7 when
on-chain features have demonstrated out-of-sample lift on the free subset.

**Do not buy row 9 early.** Historical L2 is the most expensive item on the list and order-flow
edge decays fastest; live capture is free, so capture it forward from day one and revisit in six
months with your own data. Buying two years of book history before knowing whether the rest of
the pipeline works is the wrong order.

Every one of these sits behind the §2.4 interface. Where a provider is absent, the affected
features emit `null`, the data quality score reflects it, and the UI says the input is
unavailable. **It never falls back to synthetic or mock data in a non-development mode** — the
provider registry refuses to register a mock provider unless `PLATFORM_MODE=sandbox`, the same
mechanism that already stops the sandbox faucet running in production.

---

## 6. Infrastructure estimate

**Data volume, per symbol per year:**

| Stream | Approx/yr | Notes |
|---|---|---|
| OHLCV, all timeframes | ~50 MB | Trivial |
| Trades | 2–20 GB | Compresses well in Parquet |
| L2 book (100ms, 20 levels) | 200 GB – 2 TB | Why §5 says defer |
| Derivatives | ~200 MB | |
| News + macro (all symbols) | ~5 GB | |

For 25 symbols without L2: **~150–300 GB/year**, which is unremarkable. With full L2: 5–50 TB/yr,
which is a different budget and a different storage design.

**Compute:**

| Component | Shape | Indicative |
|---|---|---|
| Ingestion | 2–4 vCPU, 8 GB, always on | ~$50/mo |
| TimescaleDB | 8 vCPU, 32 GB, 1 TB NVMe | ~$300/mo |
| Feature/inference | 4–8 vCPU, 16 GB | ~$150/mo |
| Research/training | 16–32 vCPU burst; GPU only if sequence models earn their place | ~$200–600/mo |
| Object storage | 1–5 TB | ~$25–120/mo |
| Data subscriptions | Phase 1 free → Phase 3 full | $0 → ~$2500/mo |

**Phase 1 all-in: roughly $700–900/month.** Fully provisioned with paid data and L2:
**$4000–6000/month.** Tree ensembles on tabular features train on CPU in minutes to hours; a GPU
is not needed until and unless transformer time-series models demonstrate they beat LightGBM
out-of-sample, which on this class of problem they frequently do not.

**Latency budget** (signal path, not HFT — this system targets minutes-to-hours holds):

```
market event → ingest        50–200 ms
feature computation          5–20 ms   (incremental, warm windows)
model inference (ensemble)   10–50 ms  (ONNX, CPU)
portfolio + risk             5–20 ms
order submission             50–300 ms
─────────────────────────────────────
total                        ~120–600 ms
```

That is comfortable for the strategy horizon and would be hopeless for market-making. The system
is explicitly not competing on latency, and the strategies are chosen accordingly.

---

## 7. What this document commits to *not* doing

- No feature computed differently in backtest and live.
- No macro or on-chain series read at its revised value when simulating the past.
- No provider disagreement resolved by averaging.
- No signal emitted when the data quality gate fails.
- No mock data outside `PLATFORM_MODE=sandbox`, and none of it ever labelled as real.
