# AI Trading Intelligence — Signal Pipeline, Risk & Auto-Trading

> Part 3 of 3. Part 1 is `17-ai-data-architecture.md`. Part 2 is `18-ai-ml-architecture.md`.

---

## 1. The signal pipeline

```
REAL-TIME DATA
      │
      ▼  ── fails ──▶ NO SIGNAL (recorded reason, not a degraded signal)
DATA QUALITY GATE                                    17 §2.5
      ▼
FEATURE ENGINE  (one binary, backtest and live)      17 §3
      ▼
  technical · structure · order flow · derivatives
  on-chain · news · macro · sentiment                17 §3.2, §4
      ▼
MARKET REGIME (causal)                               17 §3.5
      ▼
ML MODELS  → per-domain calibrated probabilities     18 §2.1
      ▼
ENSEMBLE (stacked, regime-aware, calibrated)         18 §2.2
      ▼
PROBABILITY  +  predicted σ  +  predicted slippage
      ▼
EXPECTED VALUE  (net of fees, spread, slippage, funding)
      ▼  ── EV ≤ threshold ──▶ NO TRADE
PORTFOLIO OPTIMISER                                  §3
      ▼  ── rejected ──▶ NO TRADE
RISK ENGINE                                          §4
      ▼  ── any check fails ──▶ NO TRADE
SIGNAL  (persisted BEFORE outcome is knowable)       §6
      ▼
 MANUAL   │   PAPER   │   SHADOW   │   AUTO
                                       ▼
                              EXECUTION ENGINE       §8
                                       ▼
                              SMART ORDER ROUTER     docs/13
                                       ▼
                              POSITION → P&L → MODEL FEEDBACK
```

Note the shape: **four separate stages can each independently produce NO TRADE**, and none of
them can be overridden by a strong reading at another stage. A 90% probability with poor
liquidity is not a trade. Perfect model agreement during a data-quality failure is not a trade.
This is deliberate — the alternative, a single blended score that any one strong input can carry,
is how systems end up trading their worst setups at their largest size.

---

## 2. Expected value, and why it is the real gate

Probability is not edge. The gate is:

```
EV = p_win · avgWin_R − (1 − p_win) · avgLoss_R − costs_R

costs_R = (fees + spread + expected slippage + expected funding) / (stopDistance)
```

A 65% probability on a 1:1 payoff at 0.15R of cost is an EV of +0.15R and is worth taking. A 71%
probability on a 0.4 payoff at the same cost is negative and is not, however good the number
looks on a dashboard. Costs are divided by stop distance because that is what converts them into
the same R units as everything else — and it is why tight-stop strategies are so much more
cost-sensitive than they appear.

`avgWin_R` and `avgLoss_R` come from the **realised** distribution of that model, in that regime,
on that symbol — not from the theoretical target. A model whose TPs are rarely reached is
described by its history, not by its intentions.

The threshold is a config value with a floor: EV must clear `2 × costs_R`, so a marginal edge
that is really just a cost estimate with error bars does not trade.

---

## 3. Portfolio construction

A signal is a candidate, not an instruction. The optimiser takes the full candidate set and the
current book, and answers a different question: *given everything already held, what is the best
incremental use of risk budget?*

Inputs: expected return and its variance per candidate, the covariance matrix across candidates
and existing positions, liquidity, correlation to the existing book, concentration limits,
current drawdown state, and macro risk.

The correlation constraint is the one the user's example points at, and it is worth being precise
about. BTC and ETH commonly run at 0.85+ correlation. Two 20% positions in assets correlated at
0.85 is not a diversified 40% — it is approximately a 38% position in one bet. So exposure is
measured in **risk contribution**, not notional, and the limits apply there. Concretely: a
correlation-weighted exposure cap, a cluster cap (assets are clustered by rolling correlation and
the cluster has a budget), and a beta-to-BTC cap on the whole book, because in crypto nearly
everything is a levered BTC position during a drawdown.

Method: risk-budgeted allocation with expected-return tilts, constrained. Not unconstrained
mean-variance — it is famously unstable, concentrating violently on whichever asset has the
noisiest return estimate.

Turnover is penalised, so a small change in a candidate's score does not churn the book and pay
the spread for nothing.

---

## 4. Risk architecture

### 4.1 Position sizing

Size is an output of risk, never of confidence.

```
riskPerTrade = min(
  accountRisk% × equity,                    // fixed fractional
  volTargetedSize(predicted σ),             // vol targeting
  fractionalKelly(p, payoff) × cap,         // ≤ ¼ Kelly, hard-capped
  liquidityCap(book depth, ADV),
  remainingDailyRiskBudget,
  concentrationHeadroom
)

positionSize = riskPerTrade / stopDistance
```

The minimum, always. Every term is a ceiling and the binding one wins.

Two notes. **Kelly is capped at a quarter and is never the sole term** — full Kelly assumes the
probability estimate is correct, and a slightly overestimated `p` produces catastrophic sizing;
fractional Kelly is the standard defence and it is still not trusted alone. And the requirement
that "confidence 90% → 90% of capital" must never happen is structural here: confidence enters
only through the Kelly term, which is one capped input among six.

### 4.2 Pre-trade checks

Every check blocks independently. Each is individually tested against an order that violates it.

Per-order: max position size, max notional, allowed assets, leverage limit, min liquidity, max
spread, price sanity against a second venue, order size vs. book depth, duplicate detection.

Per-strategy: max concurrent positions, max exposure, max correlated exposure, daily loss limit,
drawdown limit, max daily trades.

Per-account: total exposure, total leverage, **the 10% max drawdown hard stop** that
`docs/12 §6.0` establishes as load-bearing under the 50/50 profit share, daily loss limit,
margin sufficiency.

Global: platform exposure, per-asset platform concentration, kill-switch state, market-data
health, execution-venue health.

### 4.3 Stops and targets

Stops: fixed %, ATR-multiple, structure-based (below the swing that invalidates the thesis),
trailing, and time-based. Chosen per strategy, not globally, because a mean-reversion stop and a
trend-following stop are answering different questions.

**Every automated position has a stop before it has a fill.** The stop is submitted with, or
immediately after, the entry, and a position discovered without one triggers an alert and a
protective close. There is no configuration in which an automated entry is allowed to sit
unprotected.

Targets: TP1/TP2/TP3 with partial closes, trailing after TP1, and move-to-breakeven as a
configurable rule. The distribution across targets is strategy config.

### 4.4 Emergency controls

| Control | Trigger | Effect |
|---|---|---|
| Global kill switch | Manual (dual control) | All new orders stop, platform-wide |
| Strategy kill switch | Manual or automatic | That strategy stops |
| User kill switch | User, single click | That user's automation stops |
| Daily loss limit | Automatic | Entries stop until the next UTC day |
| Drawdown limit | Automatic | Entries stop; requires human re-enable |
| Data failure | Automatic | **NO NEW TRADES** while data is unhealthy |
| Execution API failure | Automatic | New orders stop; reconciliation runs before resuming |
| Price anomaly | Automatic | That symbol is halted pending confirmation |
| Model drift | Automatic | Size reduced, then paused (`18` §5.4) |

Two properties are essential. **Kill switches only ever stop new risk** — they never blindly
market-close open positions, because a panic liquidation into a thin book is frequently worse
than the event that triggered it; existing positions keep their stops and are managed out.
And a switch that fires automatically **requires a human to clear**, since a system that
re-enables itself after tripping a drawdown limit does not have a drawdown limit.

---

## 5. Signal presentation

### 5.1 The record

Every signal carries: direction, probability (calibrated), expected value in R, risk/reward,
entry zone, stop, TP1–3, position size, market regime, model agreement, data quality, liquidity
score, volatility state, macro risk, news risk, model id and version, feature snapshot, and tier.

### 5.2 Tiers

| Tier | Meaning | Auto-trading |
|---|---|---|
| **A+** | High probability, strong agreement, favourable regime, clean data, high liquidity | Eligible |
| **A** | Good probability, good agreement | Eligible |
| **B** | Moderate edge | Opt-in only |
| **C** | Weak but positive edge | Manual only, never automated |
| **NO TRADE** | No statistical edge, or any gate failed | — |

Tier is derived from the pipeline's own outputs by a documented function, not assigned. The
default automated set is A+ and A.

### 5.3 "Why?" — explanation from the actual output

The explanation is **generated from the model's real attribution**, never written independently.
Its inputs are the per-domain probabilities, SHAP values on the actual feature vector, the regime
classification, and the gate results. The LLM's only job is to render that into a sentence.

The distinction matters more than it sounds. An explanation composed separately from the decision
is a plausible-sounding story about a number it did not produce, and it will confidently
rationalise a bug. Attribution-derived text will instead say something odd when something odd is
happening, which is the entire value of having it.

Where a factor did not contribute, the explanation says so rather than omitting it — "macro was
neutral and did not affect this" is information.

### 5.4 Immutability

The signal row is written **before the outcome can be known**, and `signals` gets the same
append-only trigger already protecting `nav_snapshots` and `fee_accruals`. The outcome is a
separate insert-only `signal_results` row, as today.

This is the foundation of every performance number the platform displays. A system that can edit
a past prediction has no performance history, only a marketing asset.

---

## 6. Performance reporting

Per window (today / 7D / 30D / 90D / 1Y / since launch), overall and per asset, per strategy, per
tier, per regime: signal count, win rate, profit factor, expectancy in R, average R, max
drawdown, Sharpe, Sortino, and calibration (predicted vs. realised, bucketed).

The calibration display is the one that keeps the rest honest: it shows, for every probability
bucket the system emitted, what fraction actually resolved. A well-behaved system's 70% bucket
resolves near 70%. Publishing that chart makes overstated confidence immediately visible, which
is precisely why it is published.

Every figure is computed from `signal_results` as a view. There is no stored aggregate anyone can
write to, and no path that can display a number not derived from recorded outcomes — the same
guarantee already enforced for NAV and fees.

---

## 7. Auto-trading

### 7.1 Self-directed users

Enabling automation is a gated flow, not a toggle:

```
Risk disclosure (signed, versioned — the existing legal module)
  → strategy selection (only strategies with an APPROVED production model)
  → capital allocation
  → max daily loss · max drawdown · max position size
  → allowed assets · leverage (default OFF)
  → paper-trading period (default: mandatory)
  → explicit confirmation
```

Defaults are conservative: leverage disabled, drawdown limit 8%, daily loss 2%, max position 20%,
A+/A tiers only. Every limit is enforced in the risk engine, server-side. A client that sends a
larger size is rejected, because a limit enforced in the browser is not a limit.

### 7.2 Managed strategies

For pooled investment strategies, the master strategy trades and the fill is allocated across
investors by the existing allocation engine:

```
AI signal → risk engine → portfolio construction → execution
  → fill → pro-rata allocation by units → NAV
```

The property that must hold: **every investor receives the same execution price for the same
fill.** Allocation is by the largest-remainder `apportion` already used elsewhere, so the parts
sum exactly to the fill with no residue and no investor systematically advantaged by rounding.
No investor-specific ordering, and no path by which one participant gets a better fill than
another on the same trade.

### 7.3 Modes

| Mode | Data | Orders | Purpose |
|---|---|---|---|
| Backtest | Historical | Simulated | Validation |
| Paper | Live | Simulated | Forward test without capital |
| Shadow | Live | None (decisions recorded) | Compare a challenger to the incumbent |
| Live | Live | Real | Production |

Paper P&L is never presented as real, and the UI labels it at the component level rather than
relying on page-by-page discipline — the same approach `docs/07 §10` already takes with
disclaimers.

---

## 8. Execution

Order type selected by urgency and liquidity: passive limit where the edge tolerates waiting,
aggressive limit or market where it does not. Large orders sliced (TWAP/VWAP/POV) against
measured book depth. Routed through the smart order router (`docs/13`).

**Execution quality is measured, not assumed.** Every fill records implementation shortfall
against the decision price, realised slippage against the prediction, and fill rate. These feed
back into the slippage model — which is what stops the backtest's cost assumptions drifting away
from reality over time, and is the loop that most systems never close.

Reconciliation against the venue runs continuously; a divergence between believed and actual
positions halts new orders immediately. Trading on a position you have mis-recorded is
unbounded risk, and it is a failure mode that the existing custody reconciliation job already
demonstrates the shape of.

---

## 9. Delivery order

The dependency chain is real — each stage is unbuildable or unverifiable without the one before —
so the sequence is not negotiable even though the later stages are the interesting ones.

| Phase | Content | Gate to pass |
|---|---|---|
| **A** | TimescaleDB, ingestion, point-in-time store, data quality gate | Replaying history reproduces recorded live data exactly |
| **B** | Feature engine, 100+ features, registry, multi-timeframe, feature store | Offline and online vectors match bit-for-bit |
| **C** | Labelling, purged CV, walk-forward, negative controls | Shuffled labels destroy performance; shifted features improve it |
| **D** | Event-driven backtester with full cost modelling | Zero-cost and realistic-cost runs differ materially |
| **E** | Models, calibration, ensemble, regime | Beats logistic-regression baseline out-of-sample |
| **F** | Model registry, drift monitoring, paper, shadow | A drifting model is quarantined automatically |
| **G** | Signal engine, tiers, EV gate, explanation, history | Signals persist before outcomes; NO TRADE fires under conflict |
| **H** | Portfolio optimiser, risk engine, sizing | Every risk check blocks a violating order, proven per check |
| **I** | Auto-trading, execution, kill switches | Kill switch stops new orders under load; data failure halts entries |
| **J** | Research Lab, performance dashboards, calibration display | Trial counter feeds deflated Sharpe; lab cannot write to the registry |

Phase A is the least glamorous and the most load-bearing. Skipping to E is the standard mistake
and it produces a system that cannot be evaluated.

---

## 10. What this system will not claim

- No accuracy figure that is not from out-of-sample data, with its sample size and confidence
  interval shown next to it.
- No backtest presented without its costs, its trial count, and its deflated Sharpe.
- No paper or shadow performance shown as real.
- No signal whose explanation was written separately from the model output that produced it.
- No "guaranteed", "100% accurate", "risk-free" — already lint-enforced, and the ban extends to
  every surface added here.
- No model in production that cannot be reproduced from its registry entry.
- Where a component needs data the platform does not have, it reports the input as unavailable.
  It does not substitute a mock and it does not quietly drop the factor from the average.
