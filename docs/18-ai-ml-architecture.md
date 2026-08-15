# AI Trading Intelligence — ML, Validation & Backtesting

> Part 2 of 3. Part 1 is `17-ai-data-architecture.md`. Part 3 is
> `19-ai-signal-and-auto-trading.md`.

---

## 1. What is being predicted

A model that outputs "BUY" is unfalsifiable — buy at what price, held how long, exited on what?
Every model here predicts a **precisely specified, resolvable event**, so that "was it right?"
has an answer that does not depend on interpretation.

### 1.1 The label: triple barrier

For each candidate bar, three barriers are set from the volatility at that instant:

- upper: `entry + k_tp · σ_t`
- lower: `entry − k_sl · σ_t`
- vertical: `t + maxHoldingPeriod`

The label is whichever is touched first: `+1`, `−1`, or `0` on timeout. Two properties make this
the right choice. It is **volatility-scaled**, so a 1% move in a calm market and a 1% move in a
crisis are not treated as the same event — a fixed-percentage label quietly teaches the model to
predict volatility instead of direction. And it is **path-dependent**, resolving on what actually
happened between here and the horizon rather than on the close price, which is what a real
position with a stop actually experiences.

Barrier resolution uses the finest data available, not the signal timeframe. On a 1h label, a bar
whose low touched the stop and whose high touched the target must be resolved by the 1m path, not
by assuming the favourable one. Assuming favourably is worth an enormous amount of fictional
performance and is almost never noticed.

### 1.2 Meta-labelling

Two stages, and the split matters:

1. **Primary model** — should there be a position, and which way. Trained on the triple-barrier
   label.
2. **Meta model** — given that the primary says LONG here, is *this particular instance* one
   worth taking? Trained on a binary label: did the primary's call resolve profitably.

The meta model is what makes NO TRADE a first-class output rather than a threshold on a
confidence score. It is also where precision is bought at the cost of recall, which is the
correct trade for a system whose objective is expectancy rather than activity. Position size is
then driven by the meta model's probability, so low-conviction instances are small or skipped
rather than downweighted after the fact.

### 1.3 Other heads

Alongside direction, the ensemble predicts realized volatility over the horizon (needed for
sizing and stop distance), the probability of an adverse excursion beyond the stop (needed for
honest R estimates), and expected slippage given current book state (needed to make the EV
calculation real rather than aspirational).

---

## 2. Model layer

### 2.1 Model choice, and why the boring answer wins

| Family | Use | Verdict |
|---|---|---|
| **LightGBM / XGBoost** | Primary and meta on tabular features | **The workhorse.** Handles missing values natively, robust to monotone transforms, fast, interpretable via SHAP. This is where the results come from. |
| **Regularised logistic regression** | Baseline | Mandatory. If the ensemble cannot beat it out-of-sample, the ensemble is not doing anything and should be deleted. |
| **Random forest** | Diversity member | Cheap, decorrelates the boosted trees a little. |
| **1D-CNN / TCN** | Raw sequence patterns | Sometimes adds a little on short horizons. Try after the tabular path works. |
| **Transformer time-series (PatchTST etc.)** | Long-range sequence | Only if it beats LightGBM on the same purged splits. On noisy financial data with limited samples, it usually does not. Expensive to be wrong about. |
| **HMM / clustering** | Regime | Fit causally only (`17` §3.5). |
| **LLM** | News extraction, explanation, research | **Never a probability source.** See §2.3. |

The requirement is explicit that a model is chosen on out-of-sample performance rather than on
being fashionable, and it is worth stating what that implies: the likely outcome of this work is
that a well-regularised LightGBM on well-constructed, leak-free features beats everything else,
and the value delivered was in the features and the validation, not in the model class.

### 2.2 Ensemble

Per-domain models — technical, structure, order flow, derivatives, on-chain, macro, news,
sentiment — each producing a calibrated probability, combined by a **stacked meta-learner**
rather than by fixed weights.

Two constraints on the combiner:

- It is trained on **out-of-fold predictions only**. Training a stacker on in-sample base-model
  outputs is a leak that reliably produces a spectacular backtest and nothing else.
- Its inputs include the regime, so the learned combination can be regime-dependent — which is
  how "trend strategy ≠ range strategy" becomes a property of the model rather than a hand-tuned
  switch.

**Calibration is mandatory and is not automatic.** Gradient boosting outputs scores, not
probabilities; a raw 0.7 does not mean 70%. Every model is calibrated (isotonic or Platt) on a
held-out fold, and calibration is verified with a reliability diagram and Brier score on
out-of-sample data. A system that shows the user "71% probability" while its 0.7 bucket resolves
at 55% is misreporting, regardless of whether the underlying ranking is any good.

**Model agreement** — the "8/10" in the required signal display — is measured as the dispersion
of the base models' calibrated probabilities, not as a count of votes above a threshold. Low
dispersion at high probability is a strong state; high dispersion is a NO TRADE input.

### 2.3 Where the LLM belongs, and where it does not

Used for: news classification and extraction (`17` §4), rendering an explanation from the actual
model output, and assisting research.

Not used for: producing a probability, a direction, a size, or a price. The reason is not
squeamishness about LLMs — it is that a number from an LLM cannot be validated the way a
classifier can. There is no out-of-sample curve for a prompt, no calibration check, no feature
importance, and no way to detect drift. Anything that reaches the risk engine must be
measurable, and the explanation layer is downstream of the decision, never upstream of it
(`19` §5).

---

## 3. Validation

This section is the actual product. A model is a commodity; a validation procedure that does not
lie is not.

### 3.1 Purged, embargoed cross-validation

Standard k-fold on time series is invalid here, for a reason that is easy to miss: the
triple-barrier label at time `t` resolves at some later time `t + h`, so a training sample near a
fold boundary **overlaps in time** with a test sample. The model sees the outcome window it is
being tested on.

Therefore:

- **Purge** — drop training samples whose label horizon overlaps any test sample's window.
- **Embargo** — additionally drop a gap after each test fold, because serial correlation leaks
  across the boundary even without literal overlap.
- **Sample weighting by uniqueness** — overlapping labels are not independent observations;
  weighting by the inverse of concurrent-label count stops heavily-overlapped periods dominating
  the fit.

Without purging, a genuinely worthless strategy routinely cross-validates at 60%+.

### 3.2 Walk-forward, as the primary evidence

```
|── train ──|─ val ─|─ OOS ─|
       |── train ──|─ val ─|─ OOS ─|
              |── train ──|─ val ─|─ OOS ─|
```

Anchored and rolling variants both run. Every hyperparameter choice, every feature-selection
decision and every threshold is made **inside** the training window. The OOS segment is scored
once and never optimised against. The reported performance is the concatenation of the OOS
segments and nothing else.

Retraining cadence is itself a walk-forward parameter, not a guess.

### 3.3 Multiple-testing correction — the discipline nobody wants

Try 500 configurations and the best will look excellent by chance alone. This is the mechanism by
which most published backtests are wrong, and it is invisible to every individual step of an
otherwise-correct process.

So: **the number of configurations tried is recorded**, automatically, by the research harness,
and the reported Sharpe is **deflated** for it (Bailey–López de Prado). A strategy whose deflated
Sharpe does not clear the bar does not get promoted, no matter what the raw number says. The
trial count cannot be reset by starting a new notebook, because the harness — not the researcher
— owns the counter.

Also computed: **Probability of Backtest Overfitting** via combinatorially-symmetric
cross-validation, which estimates how likely it is that the selected configuration is
out-of-sample mediocre.

### 3.4 The mandatory negative controls

Every promotion candidate runs these, and a failure blocks promotion:

| Control | Passes when |
|---|---|
| **Shuffled labels** | performance collapses to zero. If it does not, there is a leak. |
| **Shifted features** (features moved one bar into the future) | performance *improves*. If it does not, the features are already leaking the future. |
| **Random-entry benchmark**, same sizing and exits | strategy beats it. Isolates whether the edge is in the signal or in the risk management. |
| **Cost sensitivity** (2× fees, 2× slippage) | edge survives. Most marginal strategies do not. |
| **Universe holdout** — never trained on this symbol | some edge transfers. Otherwise it is per-symbol overfitting. |
| **Regime holdout** — an entire market regime excluded from training | some edge survives. |

The shifted-features control deserves emphasis: it is the cheapest, most reliable leak detector
available and almost nobody runs it.

---

## 4. Backtesting engine

### 4.1 Event-driven, not vectorised

Vectorised backtests over a dataframe are fast and are structurally prone to lookahead, because
the whole series is in scope at every step. This engine is **event-driven**: a replay clock
advances, and at each step the strategy is handed only a read-only view whose interface *cannot
return data past the clock*. Lookahead becomes a type error rather than a code-review question.

The same feature binary as live (`17` §1), the same portfolio and risk code as live
(`19` §3–4). The backtest differs from production in exactly one component — the execution
simulator replaces the venue — and that is the whole point.

### 4.2 Execution realism

A backtest that fills at the close price for free is a random number generator with a nice chart.
Modelled:

- **Fees** from the real `FeeSchedule`, maker and taker distinguished.
- **Spread** — entry at the far side, always.
- **Slippage** as a function of order size against the book, not a flat constant; where L2 is
  unavailable, a conservative volume-participation model with the parameter fitted from live
  fills once any exist.
- **Partial fills** with the remainder subject to the next bar's conditions.
- **Latency** between decision and fill, so a signal on a fast-moving bar does not get the
  decision-instant price.
- **Funding** accrued on every held perp position across every funding window.
- **Liquidity cap** — a position that would exceed a share of realized volume is truncated. This
  is the constraint that stops small-cap strategies from backtesting brilliantly at sizes the
  market could never absorb.
- **Market impact** for large orders, since the fund's own size moves the price it gets.

### 4.3 Biases, addressed structurally

| Bias | Defence |
|---|---|
| Lookahead | Data view cannot return the future (§4.1) |
| Data leakage | Purged/embargoed CV (§3.1) + shifted-feature control (§3.4) |
| Survivorship | Point-in-time universe snapshot, already implemented in `BacktestRun.pairUniverseSnapshotJson`; delisted symbols retained |
| Overfitting | Walk-forward + deflated Sharpe + PBO (§3.2–3.3) |
| Revision | `ingestTime` filtering and macro vintages (`17` §2.1) |
| Outlier luck | Bootstrap CIs; performance excluding the best 5 trades reported alongside |

### 4.4 Metrics

Reported together, never selectively: total and annualised return, Sharpe, **deflated Sharpe**,
Sortino, Calmar, max drawdown and its duration, recovery factor, profit factor, expectancy in R,
win rate, average win, average loss, payoff ratio, largest win and loss, trade count, exposure
time, turnover, total fees, total slippage, total funding, tail ratio, Ulcer index, and a
bootstrap confidence interval on the mean return.

Win rate is never displayed alone. A 70% win rate with a 0.3 payoff ratio loses money, and
presenting it as a headline is the most common way a genuine backtest still misleads.

### 4.5 Regime breakdown

Every metric is reported per regime — bull, bear, sideways, high vol, low vol, crash, recovery —
and the number of independent regime episodes the strategy was actually tested across is stated
plainly. A Sharpe of 2.0 earned across one bull market is one observation, not a track record,
and the report says so rather than leaving the reader to work it out.

---

## 5. Model registry and lifecycle

### 5.1 Status ladder

```
RESEARCH → BACKTESTED → PAPER → SHADOW → APPROVED → PRODUCTION → DEPRECATED
                                                          ↓
                                                      QUARANTINED
```

Only `PRODUCTION` models can influence real capital. Promotion is a recorded, gated action with
an approver and a reason; it is never a config edit. The `APPROVED → PRODUCTION` step in
particular requires an explicit human decision by someone who is not the model's author, on the
same principle that already puts fee crystallisation above the manager's own authority.

### 5.2 What every version stores

Model id and semantic version; the training data range and its content hash; the exact feature id
list **with versions**; the label definition and its barrier parameters; hyperparameters; the
random seed; library versions; the full CV, walk-forward and OOS reports; the deflated Sharpe and
the trial count that produced it; every negative-control result; the calibration curve; feature
importances; the approver and timestamp; and a hash of the ONNX artefact.

The rule this enforces: **a production model can be reproduced exactly, and it cannot be
swapped silently.** The running model's artefact hash is checked against the registry on load and
on a schedule; a mismatch takes trading offline rather than logging a warning.

### 5.3 Promotion gates

| Transition | Requires |
|---|---|
| RESEARCH → BACKTESTED | Walk-forward complete, all negative controls passed |
| BACKTESTED → PAPER | Deflated Sharpe above bar, PBO below bar, min trade count, max DD within the platform's 10% ceiling |
| PAPER → SHADOW | Min 30 days paper, live performance not materially divergent from backtest |
| SHADOW → APPROVED | Min 30 days shadow, calibration holding, agreement with realised outcomes |
| APPROVED → PRODUCTION | Human approval, dual control, risk sign-off |
| any → QUARANTINED | Automatic, on drift or degradation (§6) |

The bars are versioned config, not constants in code — but they are stored where changing them is
an audited action, because a gate whose threshold can be quietly lowered is not a gate.

**Paper and shadow are different things** and both are required. Paper trading runs the strategy
against live data with simulated fills and its own P&L. Shadow runs the *production* model live,
recording every decision it would have made, without placing orders — which is what lets a
successor be compared against the incumbent on identical market conditions before it takes over.

### 5.4 Drift and degradation

Monitored continuously: feature distribution drift (PSI, KL divergence against the training
distribution), prediction distribution drift, calibration decay, rolling accuracy against a
control chart, realised-vs-expected R, and regime change relative to the training composition.

The response is graduated and automatic, not a page to a human who may be asleep:

```
warning        → alert, no change
degradation    → position sizing scaled down (continuous, not a cliff)
severe         → new entries stopped, existing positions managed to exit
critical       → QUARANTINED; falls back to the previous PRODUCTION version
```

Falling back to the previous version rather than to no model at all matters, because "no model"
in a system with open positions is not a safe state.

---

## 6. Continuous learning, without the failure mode

New data is collected continuously. **Production models are not retrained automatically into
production.** The user's instruction here is exactly right and it is worth naming the failure it
prevents: a model that retrains on recent data after every drawdown learns to chase whatever just
happened, and does so most aggressively at turning points, which is when it is most expensive.

The cycle is scheduled and always ends in a human gate:

```
collect → schedule retrain → purged CV → walk-forward → negative controls
       → backtest → paper → shadow vs incumbent → human approval → production
```

A challenger only replaces the incumbent if it beats it in shadow on the *same* period. Automatic
promotion is not available at any threshold.

---

## 7. Research Lab

An internal, operator-only surface (`INVESTMENT_MANAGER`+, separate from the investor product):

dataset and universe selection · timeframe and label configuration · feature subset selection ·
model family and hyperparameter search · walk-forward runner with live progress · experiment
comparison · SHAP feature importance · equity, drawdown and rolling-Sharpe charts · trade-level
inspection · regime breakdown · correlation between candidate strategies · promotion actions.

Two properties keep it honest. Every experiment is **logged and counted** against the trial
counter that feeds the deflated Sharpe (§3.3), so exploration is free but is not free of
consequence. And the lab **cannot write to the production model registry** — it can only submit a
promotion request, which goes through the §5.3 gates.

Correlation between candidate strategies is in the list deliberately: five strategies that are
all long-momentum are one strategy with five names, and the portfolio layer needs to know that
before allocating to all of them.
