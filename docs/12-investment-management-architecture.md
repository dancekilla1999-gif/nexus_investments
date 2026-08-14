# 12. Investment Management Architecture

> **Status:** design. Supersedes the structural choice in `docs/10-managed-accounts-architecture.md`
> §2 (see §0.2 below). The consent, 10%-drawdown and backtest-gate requirements from docs 10
> and 11 are **retained in full** and folded into this design.

## 0. What this document decides

### 0.1 The platform has two modes, not two products

Every user gets both. They are two ways of using one wallet, one ledger, one execution layer,
one risk engine — not two applications bolted together.

| | **Mode A — Self Trading** | **Mode B — Investment Management** |
|---|---|---|
| Who decides the trade | The user | The strategy manager |
| Whose capital | The user's, held in their own buckets | The user's, contributed to a strategy pool in exchange for units |
| What the user holds | Asset balances | **Units** in a strategy |
| P&L attribution | Direct — the position is theirs | Via unit price (NAV per unit) |
| What they can lose | Their position | Their contribution, bounded by the strategy's risk limits |

A single `$25,000` balance can be split `$10,000` self-trading / `$15,000` invested. Those two
numbers are not a UI presentation of one balance — they are **different ledger accounts with
different owners of economic outcome**, and the ledger can always name the owner of each.

### 0.2 Pooled master with unit accounting — a reversal, stated plainly

`docs/10` §2 chose **segregated sub-accounts** over a pooled fund, explicitly to avoid
fund-formation regulation. The requirements in this addendum — Master Strategy Account (§6),
Allocation Engine (§7), NAV Engine (§8), High Water Mark (§9) — describe a **pooled fund with
unit accounting**. Those are not compatible; NAV-per-unit is meaningless without pooling.

**We build the pooled model, as specified.** The concern doc 10 raised remains true and is
restated here rather than deleted: *pooling investor capital and managing it for a fee is, in
most jurisdictions, operating a collective investment scheme, and requires licensing that
segregated discretionary management may not.* That is a legal question, not an engineering
one — §27 of the addendum already commits to a compliance review before launch, and
`PLATFORM_MODE=live` remains gated behind a signed attestation. Engineering proceeds.

The schema keeps `Strategy.custodyModel ∈ { POOLED_NAV, SEGREGATED_COPY }` so a jurisdiction
that forbids pooling has a path that does not require re-architecting, and so the consent and
risk work already shipped for doc 10 is not discarded. **Only `POOLED_NAV` is implemented.**
`SEGREGATED_COPY` is a declared variant, and the code refuses to create one rather than
pretending it works.

---

## 1. Accounting entities: the segregation invariant

The requirement — *"ledger must be able to answer at any moment: whose money is this $X?"* — is
met by making ownership a property of the **account**, not of a comment on a transaction.

Six ownership domains. Every unit of value sits in exactly one:

| Domain | Owner | Can the platform spend it? |
|---|---|---|
| `USER_WALLET` | The individual user | **No** |
| `STRATEGY_POOL` | The investors of that strategy, collectively, pro rata by units | **No** |
| `FEE_RECEIVABLE` | The platform's accrued but unsettled claim against a position | Not until crystallised |
| `PLATFORM_TREASURY` | The platform | Yes |
| `PLATFORM_REVENUE` | The platform | Yes |
| `EXTERNAL` / `SANDBOX_MINT` | Nobody — boundary contra-accounts (`docs/03` §2) | n/a |

**The invariant**, checkable at any instant, per asset:

```
custody_on_chain  ==  Σ USER_WALLET  +  Σ STRATEGY_POOL  +  Σ PLATFORM_TREASURY
                      − (contra-accounts, which are negative)
```

Custody reconciliation (`docs/06` §5) already proves the left side against the right for user
wallets. Pool assets extend the same check: a strategy's holdings are reconciled against the
venue/custodian that actually holds them, and a mismatch is a `RECONCILIATION_MISMATCH` at the
same severity as a user-wallet shortfall — because it is the same failure.

### 1.1 The rule that makes "admin cannot take user money" structural

Application code can be changed. So the boundary is enforced where a change is visible in a
migration and a code review:

> **A ledger transaction may not have a `STRATEGY_POOL` or `USER_WALLET` account on one side and
> a `PLATFORM_*` account on the other, unless its type is one of the fee or settlement types
> whose amount is computed by the fee engine.**

Enforced by a database trigger, not only by a service check — the same technique already used
for append-only history and balance conservation (`docs/03` §5). The permitted crossings are a
short, named list:

| Type | Direction | Amount determined by |
|---|---|---|
| `FEE_CRYSTALLISATION` | pool → platform revenue | the accrued fee balance, from the fee engine |
| `TRADING_FEE` | pool or wallet → platform revenue | the venue-reported or scheduled fee |
| `REDEMPTION_SETTLEMENT` | pool → **the investor's own wallet** | units × NAV, less accrued fees |

Nothing else. There is no `ADMIN_TRANSFER`, no `MANUAL_ADJUSTMENT`, and no endpoint that takes
an amount and a destination from an operator. **A manager directs trades; a manager cannot
direct ownership.** Corrections, when genuinely needed, are compensating entries authored
through the same typed paths with a linked `risk_events` record and dual approval — never edits.

Fee **accruals** are deliberately *not* ledger postings. An accrual moves no assets — it is a
claim that grows daily against one investor's position — so it is recorded as an immutable
`FeeAccrual` row and reflected in that position, and only becomes a ledger movement at
crystallisation (`docs/14` §7). Posting accruals as asset movements would drag every other
investor's `navPerUnit` down for a fee they do not owe.

---

## 2. Unit accounting: the mechanism

A strategy is a pool. An investor's claim on it is denominated in **units**.

```
navPerUnit  =  poolNAV / totalUnits
poolNAV     =  Σ (position mark-to-market)  +  cash  −  accrued liabilities
```

- **Subscribe** `$15,000` at `navPerUnit = 1.2340` → investor is issued `12,155.591... units`.
- **Redeem** `U` units at `navPerUnit'` → receives `U × navPerUnit'`, less accrued fees.
- A trade changes `poolNAV`, therefore `navPerUnit`, therefore every investor's value —
  **automatically, with no per-investor recomputation and no possibility of the shares not
  summing to 100%.**

### 2.1 Why units rather than recomputing percentages per trade

§7 of the addendum describes the Allocation Engine recalculating each investor's share when a
position changes. Units deliver exactly that outcome, and are strictly safer:

- Percentages recomputed per fill drift with rounding; units are conserved by construction.
- An investor who subscribes today must not receive a share of P&L earned last week. With
  percentages that requires time-weighting every historical position; with units it is
  automatic — they simply bought in at today's price.
- Partial fills, fees and funding all move `navPerUnit` once, rather than requiring N
  per-investor postings per fill. At 10,000 investors that difference is the system working
  versus the system falling over.

The per-investor allocation view the addendum asks for (§7, and `BTC 35% / ETH 25% / …` in §12)
is **derived**: `investorExposure(asset) = poolExposure(asset) × investorUnits / totalUnits`.
It is a projection over the pool, recomputed on read, always exactly consistent.

### 2.2 Dealing points — the dilution problem

Subscriptions and redemptions must **not** execute at an arbitrary instant. If an investor buys
in at a NAV struck before a large unrealised gain is marked, they capture value belonging to
existing investors; if after, they are diluted. Both are the same bug and both are theft in
slow motion.

So: contributions land in a **`PENDING_SUBSCRIPTION`** bucket — still owned by the investor,
not yet in the pool, earning nothing — and units are issued at the **next dealing point** when
NAV is struck from marks the pool did not choose. Redemptions work the same way in reverse.
Dealing frequency is a strategy configuration (`dealingFrequency`), disclosed before the
investor commits, not after.

---

## 3. Investment Product (`Strategy`)

Configuration, all per-strategy, none hardcoded:

| Field | Notes |
|---|---|
| `name`, `description`, `thesis` | Marketplace copy |
| `custodyModel` | `POOLED_NAV` (only implemented value) |
| `riskBand` | Declared band, plus the *measured* risk metrics below |
| `baseAsset` | The asset NAV is denominated in (e.g. USDT) |
| `minimumInvestment`, `maximumInvestment` | Enforced server-side |
| `lockupDays`, `dealingFrequency`, `redemptionNoticeDays` | **Shown before subscription, never after** |
| `mgmtFeeBps`, `perfFeeBps`, `perfFeeCrystallisation` | Configurable; see §5, §6 |
| `benchmarkSymbol` | For relative performance display |
| `maxDrawdownBps` | **≤ 1000 (10%) — hard platform ceiling, from docs/10 §4** |
| `maxAssetExposureBps`, `maxLeverageBps`, `dailyLossLimitBps` | Risk Engine inputs |
| `status` | `DRAFT → BACKTESTED → OPEN → SOFT_CLOSED → PAUSED → WINDING_DOWN → CLOSED` |

**Two gates are non-negotiable and carried forward from the earlier requirements:**

1. **No strategy reaches `OPEN` without a passing `BacktestResult`** meeting the promotion
   criteria in `docs/11` — walk-forward over the top-25 pairs, survivorship-bias controls, and
   the out-of-sample thresholds recorded there. A strategy that has not been tested on history
   cannot take a single dollar.
2. **No strategy may be configured above a 10% max drawdown.** Validated at create *and*
   update, service-side, with a DB `CHECK` behind it.

### 3.1 What the marketplace may and may not say

Displayed: realised historical returns per period, max drawdown, volatility, Sharpe, Sortino,
win rate, AUM, current exposure, benchmark comparison, fee schedule, lock-up terms.

Forbidden — enforced by a lint rule over user-facing strings and a content check in the
strategy-publishing endpoint, not merely by policy: *guaranteed profit*, *guaranteed return*,
*risk-free*, *no-loss*, and equivalents. Past performance is labelled as past performance
everywhere it appears.

---

## 4. Investor position (`InvestmentPosition`)

One per (investor, strategy). Holds:

```
units                 current unit holding
costBasis             total contributed, less returned capital  (for return %)
hwmUnitPrice          high water mark, as a UNIT PRICE  (see §6)
accruedMgmtFee        accrued, not yet crystallised
accruedPerfFee        accrued, not yet crystallised
lockedUntil           lock-up expiry, stamped at subscription
```

Derived for display: `currentValue = units × navPerUnit`, `netValue = currentValue −
accruedMgmtFee − accruedPerfFee`, `pnl = netValue − costBasis`, `returnPct = pnl / costBasis`.

---

## 5. NAV Engine

Runs on a schedule and on every event that can change value. Inputs, all of them:

deposits (subscriptions), withdrawals (redemptions), realised P&L, unrealised P&L from marks,
trading fees, funding fees, blockchain/settlement fees, management fee accrual, performance fee
accrual, and any other expense — which must exist as a typed, pre-approved expense category, or
it cannot be booked at all.

Each run writes an immutable **`NavSnapshot`**: `(strategyId, struckAt, poolNAV, totalUnits,
navPerUnit, components…)`. Snapshots are append-only. `navPerUnit` is never written by any other
code path. There is no endpoint that sets NAV.

**Marks are sourced, not asserted.** A mark comes from the venue or the market-data service with
its source recorded on the snapshot. A manager cannot supply a price — that would let the
manager author their own performance fee.

---

## 6. High Water Mark and Performance Fee

HWM is stored **per investor position, as a unit price**, not as a dollar amount. This is what
makes it correct when investors enter at different times:

```
accruedPerfFee  =  max(0, navPerUnit − hwmUnitPrice) × units × perfFeeBps / 10000
```

Worked through the addendum's example (§9), with a `$1.00` starting unit price:

| Event | navPerUnit | hwmUnitPrice | Perf fee accrued on |
|---|---|---|---|
| Invest $100,000 | 1.00 | 1.00 | — |
| Pool gains 20% | 1.20 | 1.00 | the 0.20 gain |
| Crystallise | 1.20 | **1.20** | fee taken, HWM ratchets |
| Pool falls | 1.10 | 1.20 | **nothing** |
| Pool recovers | 1.20 | 1.20 | **nothing — already paid for** |
| Pool gains further | 1.25 | 1.20 | only the 0.05 above HWM |

The HWM ratchets on crystallisation and **never** decreases. It is written by the fee engine
alone; there is no administrative path to lower it, because lowering an HWM is indistinguishable
from charging a fee twice for the same performance.

**Pool NAV is gross of performance fees; the accrual is per investor.** Accruing performance
fees at pool level would charge a late-joining investor for gains earned before they arrived —
the classic equalisation bug. Management fee is likewise accrued per position
(`positionValue × mgmtFeeBps / 10000 / 365` per day), so an investor pays for exactly the time
their capital was under management.

Every accrual writes a ledger entry. The investor can open the arithmetic: period, rate, base,
HWM, resulting amount. A fee the investor cannot recompute themselves is a fee they have to take
on trust, and this platform does not ask for that.

---

## 7. Master Strategy Account and the Allocation Engine

The **Master Strategy Account** is the pool's trading identity: it holds the cash and positions,
and it is what the execution layer trades. One per strategy per venue.

The **Allocation Engine** is *not* a fan-out of orders to N sub-accounts (that is the
`SEGREGATED_COPY` model, not built). Under `POOLED_NAV` it has three jobs:

1. **Derived exposure** — project pool positions onto each investor by unit share, for display
   and for per-investor risk reporting.
2. **Subscription/redemption sizing** — at each dealing point, net the flows and tell the
   manager how much cash entered or must be raised, so positions can be scaled without
   disadvantaging either side.
3. **Wind-down allocation** — if a strategy closes, distribute realised proceeds strictly pro
   rata by units, with no discretion available to any operator.

---

## 8. Manager authority — the permission boundary

A granular role set replaces "admin can do everything" (`docs/05` §2 is extended, not replaced):

| Role | May | May **not** |
|---|---|---|
| `SUPER_ADMIN` | Configure the platform, grant roles | Move value; trade; alter NAV, HWM or history |
| `INVESTMENT_MANAGER` | Create strategies (to `DRAFT`), configure limits within platform caps, submit for approval | Publish without a passing backtest; trade above limits |
| `TRADER` | Place, modify, close orders for **assigned** strategies | Touch unassigned strategies; change limits; move value |
| `RISK_MANAGER` | Set/lower risk limits, pause strategies, force-flatten | Trade; change fees; access user PII beyond risk need |
| `COMPLIANCE_OFFICER` | KYC/AML review, eligibility, sanctions | Trade; move value |
| `FINANCE` | View fee calculations, trigger crystallisation runs | Change rates; trade; move value outside the fee engine |
| `SUPPORT` | View accounts, answer tickets | Move value; trade; view full PII by default |
| `ANALYST` | Read-only analytics | Everything else |

Two structural rules:

- **No role, including `SUPER_ADMIN`, has a path to user or pool funds.** Being an admin grants
  configuration authority, never economic authority. This is the §15 requirement, taken
  literally.
- **Risk-limit changes and fee-schedule changes require dual control** — proposed by one role,
  approved by another, both recorded. A single compromised account cannot widen its own limits.

Every manager action records: manager id, timestamp, strategy id, order id, asset, side,
quantity, price, stated reason, the risk checks that ran and their verdicts, execution venue and
external execution id. These rows are append-only by trigger — **no role can delete an audit
log**, which is enforced in the database, so it survives an application compromise.

---

## 9. Risk Engine — in front of every order

Self-trading and managed trading go through the **same** engine. There is no privileged path.

```
Order intent
  → Permission check      (may this actor trade this strategy?)
  → Mandate check         (is this asset/venue permitted for this strategy?)
  → Exposure check        (max position, max asset exposure, concentration)
  → Leverage check
  → Drawdown check        (equity vs. hwm × (1 − maxDrawdownBps/10000))
  → Daily loss limit
  → Liquidity check       (can this size actually be filled here?)
  → Volatility / correlated-exposure check
  → Execution
```

Any failure blocks the order and records the reason. The 10% drawdown breach behaves exactly as
`docs/10` §4 specifies — `CIRCUIT_BROKEN`, no new risk-increasing orders, high-severity risk
event, investor notified, and **no forced liquidation by default**, because market-selling into
a drawdown can realise a worse price than an orderly close.

**Emergency controls** (§25), each permissioned separately and each audited: global trading
pause, per-strategy pause, withdrawal pause, automated-trading pause, and emergency
liquidation — the last requiring dual authorisation, since a rogue "liquidate everything" is
itself an attack.

---

## 10. AI in the manager terminal

The assistant reads AUM, positions, exposure, market data, macro, news and signals, and says
things like *"BTC exposure is 42%; another BTC position would exceed this strategy's
concentration limit."*

It has **no execution authority**. An AI-originated order is a *proposal* that follows the
identical path as any other: risk engine → manager approval → execution. A separate, explicitly
enabled `AI_AUTOMATED` mode may skip the approval step, and when it does it runs under its own,
tighter risk limits and can be disabled instantly by the automated-trading pause. The assistant
never states a guaranteed outcome; this is the same constraint the signal engine already carries
(`docs/07`).

---

## 11. Reporting

Monthly statement, trade statement, performance report, fee statement, transaction statement,
and a tax-oriented transaction export. All generated from ledger and NAV snapshots — never from
a recomputation that could disagree with what the investor was shown at the time. Performance
history is immutable: a restatement is published as a correction with both versions visible,
never as a silent edit.

---

## 12. Delivery order

`docs/09-roadmap.md` MVP11–MVP23 carries the sequencing. The dependency that matters: **NAV,
units and the segregation invariant come before any manager can place a single trade with
investor capital.** Building the terminal first would mean trading money the books cannot yet
correctly attribute — which is precisely the failure this document exists to prevent.
