# Development Roadmap

Each milestone lists: scope, acceptance criteria, and the post-milestone gate from PRD §34
("review code → fix errors → run tests → check security → check UX → check DB migrations →
only then move on"). Status is kept current in this file — it is the single source of truth
for "what is actually built" in this repository.

## Status legend
✅ done · 🚧 in progress · ⏳ designed, not started

---

## MVP1 — Auth + User + Dashboard — ✅ done (this delivery)

**Scope:** registration, login, JWT + refresh sessions, TOTP 2FA enrollment/verification,
device tracking, RBAC roles, profile CRUD, audit logging infra, rate limiting, dashboard shell
with real auth/profile data and honest empty states for everything not yet built.

**Acceptance criteria:**
- [x] User can register, verify they're logged in, and see their profile.
- [x] Passwords hashed with argon2id, never logged, never returned by any endpoint.
- [x] JWT access + rotating refresh tokens, revocable server-side.
- [x] 2FA (TOTP) enroll + verify flow with backup codes.
- [x] Every auth/security event writes an `audit_logs` row.
- [x] RBAC roles exist (`user`/`admin`/etc.) and are enforced by a guard, not by convention.
- [x] Rate limiting active on auth endpoints.
- [x] Unit tests for password hashing, token issuance/verification, 2FA secret/verify logic.
- [x] Dashboard renders for an authenticated user with zero fabricated data.
- [x] Full Prisma schema for MVP1–MVP9 tables defined (stable schema, incremental service
      build-out), so later milestones are additive migrations, not redesigns.
- [x] Rate limiting is genuinely Redis-backed (atomic Lua-scripted storage, correct under
      concurrency and across instances) — not the in-memory default that silently stops
      working once the API scales past one process.
- [x] Structured JSON logging (pino) with a request-correlation ID threaded through access
      logs, application logs, and the client-facing error body.
- [x] Full authenticated app shell: sidebar/topbar navigation across the entire product IA
      (Wallet, Trading, P2P, Markets, Signals, Portfolio, Orders, Transactions, Subscriptions,
      Security, Profile), light/dark theme, toasts, skeleton loading states. Security Center
      and Profile are fully functional (2FA, device revocation, profile editing); every other
      section is an honest "ships in MVP-N" page, not a stub pretending otherwise.
- [x] End-to-end (supertest) test suite against a live PostgreSQL + Redis, run through the
      exact same request pipeline as production (`configure-app.ts`) — covers registration,
      login, refresh rotation, replay-attack detection, 2FA enrollment/gated login, and rate
      limiting. 9/9 passing, alongside 33 unit tests.
- [x] Full-stack browser verification (Playwright against the production build) caught and
      fixed a real bug: the mobile navigation drawer collapsed to the header's height instead
      of the viewport because `backdrop-blur` on an ancestor makes it a CSS containing block
      for `position: fixed` descendants — fixed by portaling the drawer to `document.body`.
      See `CHANGELOG.md` for the full list of what browser verification exercised.
- [x] **Legal / risk disclosure (pulled forward from MVP11):** a versioned
      `RiskDisclosureAgreement` and an insert-only `RiskDisclosureAcceptance` record — real
      backend (`/api/v1/legal/*`) and a real frontend page, not a placeholder. This is the
      compliance precondition every Managed Account will require
      (`docs/10-managed-accounts-architecture.md §3`), built now because it doesn't depend on
      the trading machinery MVP11 needs and every day it exists sooner is a day of accepted-
      version audit trail already accumulating.

**Post-milestone gate:** see `CHANGELOG.md` for the review pass performed before merge.

---

## MVP2 — Wallet + Ledger + Deposit — ✅ complete (sandbox/testnet)

**Scope:** `blockchain` module chain adapters, `wallet` deposit-address issuance, `ledger`
double-entry engine, deposit detection/crediting end-to-end **in testnet/sandbox mode only**.

**Done:**
- [x] **Double-entry ledger** (`apps/api/src/ledger`). Every value movement in the platform
      posts through one service; there is no method anywhere that sets a balance directly.
- [x] **Conservation enforced by the database, not just the application.** A deferred
      constraint trigger rejects any transaction whose entries do not sum to zero per asset,
      verified by a test that bypasses the service layer entirely and writes raw SQL.
- [x] **Append-only financial history**: `ledger_entries`, `ledger_transactions`, `audit_logs`
      and `risk_disclosure_acceptances` reject UPDATE and DELETE by trigger. Corrections are
      compensating entries, never edits.
- [x] **No double-spend under concurrency.** Ten parallel attempts to spend the same balance
      leave exactly one succeeding, proven against a real PostgreSQL with row-level locking
      (not a mock).
- [x] **Idempotency**, including two callers racing the same key concurrently.
- [x] **Reconciliation**: the balance projection is checked against a from-scratch recomputation
      of the entries, and drift is detected and logged.
- [x] **18-decimal precision** end to end, with a formatter that never emits exponential
      notation into a user's wallet.
- [x] Wallet API: balances, internal transfers between the user's own buckets, asset listing —
      with platform-managed buckets (LOCKED/PENDING) rejected as transfer endpoints server-side.
- [x] A real Wallet page and live dashboard balances, plus a clearly-labeled sandbox testnet
      faucet that posts through the exact deposit accounting path a real deposit will use.
- [x] **Blockchain abstraction layer** (`BlockchainAdapter`) with a viem-based EVM adapter
      serving every EVM chain, verified against a live Sepolia node rather than a mock.
- [x] **Watch-only HD deposit-address derivation** from an account xpub. No private key or seed
      appears in configuration at all; the API is structurally incapable of signing.
- [x] **Deposit address issuance** per (user, chain), stable across requests, with the
      derivation counter read under a row lock so two concurrent requests can never be handed
      the same address.
- [x] **Deposit detection → PENDING credit on first sight → AVAILABLE at the required
      confirmation depth**, idempotent on `(chainId, txHash, logIndex)` so rescans, restarts and
      reorg rewinds cannot double-credit.
- [x] **Scheduled custody reconciliation** comparing the EXTERNAL boundary balance against
      on-chain holdings, filing `RECONCILIATION_MISMATCH` risk events — shortfall at severity 5,
      surplus at 1, deduplicated to one open incident per (chain, asset).
- [x] **Deposit UI**: per-chain address with copy, an unmissable wrong-network warning, the list
      of assets actually creditable on that chain, and live confirmation progress that never
      lets a pending deposit read as spendable.
- [x] 132 automated tests passing (64 unit/integration including live Sepolia, 68 e2e against
      live PostgreSQL + Redis), plus headless-browser verification at desktop and mobile widths.

**Design decisions made during implementation** (each found by testing against real
infrastructure rather than mocks — see `CHANGELOG.md`):
- A `LedgerAccountType.EXTERNAL` platform-boundary contra-account was added: double-entry has
  no way to originate value without one, so a deposit was structurally impossible to record.
- `SET CONSTRAINTS ALL IMMEDIATE` is issued at the end of every ledger transaction, because
  Prisma swallows errors raised during its own COMMIT — without it a violated constraint
  correctly rolled the write back but reported success to the caller.
- Deriving an address from a *compressed* public key produced a valid-looking but wrong address,
  which would have made every deposit address unspendable. Keys are decompressed before hashing,
  with a regression test against a published test vector.
- A `SANDBOX_MINT` contra-account was split out of `EXTERNAL`: the faucet's play money was being
  booked as value that had crossed the custody boundary, making reconciliation report a
  permanent multi-thousand-ETH shortfall against a live chain.
- One shared definition of "creditable asset" (`src/deposits/creditable-assets.ts`) now backs
  the watcher, the deposit screen and reconciliation. A token row with no contract address is
  invisible to the scanner, and was previously being reconciled against the *native* balance.

**Deliberately not in this milestone:** withdrawals (they ship with the risk engine and AML
screening that gate them, MVP3), and sweeping to cold custody — until sweeping exists,
reconciliation's custody side is simply the deposit addresses.

## MVP3 — Withdrawal + Security — ⏳ designed

**Scope:** withdrawal request/approval flow, `risk` module v1 (velocity + new-address
scoring), KYC module with a first provider integration (recommend **Sumsub** — has a
sandbox/free developer tier, or **Onfido**; both behind the `KycProvider` interface so the
choice is reversible), withdrawal whitelist, step-up auth enforcement on withdrawal creation.

**Acceptance criteria:**
- No withdrawal reaches the blockchain module without passing through risk scoring.
- Whitelisted-address cool-down and step-up 2FA are enforced server-side (tested by attempting
  to bypass via direct API calls, not just via UI flow).
- KYC status gates withdrawal limits (tiered), verified by an integration test per tier.

## MVP4 — Market Data + Trading — ⏳ designed

**Scope:** `market-data` ingestion (start with a public REST/WS feed, e.g. Binance public
market-data WebSocket for read-only price/candle/orderbook mirroring — no trading against
Binance, purely a bootstrap data source until/unless the platform has enough of its own order
flow to run a real book), `trading` module with market/limit/stop/stop-limit/OCO order types,
spot-only matching engine, `orders`/`trades` persistence.

**Acceptance criteria:**
- Order state machine (open → partially filled → filled/cancelled) has no invalid transitions
  (tested exhaustively).
- Concurrent order placement against the same balance cannot over-spend (race-condition test
  with parallel requests).
- Order book and trade tape update over WebSocket within the latency budget defined in the
  module's README.

## MVP5 — P2P — ⏳ designed

**Scope:** ads, order lifecycle, escrow (funds move to `locked` via the ledger the moment an
order is accepted), dispute flow, reputation scoring.

**Acceptance criteria:**
- Escrowed funds cannot be released except by (a) both-party confirmation, or (b) admin
  dispute resolution — no third code path exists.
- Dispute evidence and resolution are attributed and audit-logged.
- Fraud/risk scoring feeds the same `risk_events` table as MVP3 (one risk queue, not two).

## MVP6 — Signal Engine — ⏳ designed

**Scope:** indicator engine (100+ indicators, unit-tested against reference values), signal
generation (rules/weighted-scoring v1), signal performance tracking, banned-phrase copy lint.

**Acceptance criteria:**
- Every shipped indicator has a reference-value unit test.
- `signal_results` is insert-only (schema-enforced) and aggregate stats are computed views,
  not editable fields.
- No UI copy contains banned guarantee language (automated check in CI).

## MVP7 — AI + News + Macro — ⏳ designed

**Scope:** news aggregation (CryptoPanic to start), macro calendar (Finnhub/Trading Economics
to start), on-chain context (DefiLlama + CoinGecko to start), AI assistant grounded in
platform data + Knowledge Engine, confidence modifier wiring into the Signal Engine.

**Acceptance criteria:**
- AI assistant answers are traceable to a data source it actually queried (logged context),
  and it explicitly says "I don't have that data" rather than fabricating when it doesn't.
- News/macro items are tagged (importance, affected assets, sentiment, confidence) at
  ingestion, not post-hoc.

## MVP8 — Subscriptions — ⏳ designed

**Scope:** plan tiers (Free/Pro/Elite per PRD §13), entitlement checks gating signal
feed/feature access, `payments`/fee engine wired to Admin-configurable rates (PRD §20),
referral commission ledger.

**Acceptance criteria:**
- Plan changes take effect without a deploy (Admin Panel-editable).
- Entitlement checks are enforced server-side on every gated endpoint, not just hidden in the
  UI.
- Referral commissions post through the ledger like any other financial event (no special-case
  balance mutation).

## MVP9 — Admin + Risk + AML — ⏳ designed

**Scope:** full Admin Panel (PRD §19 section list), AML transaction-monitoring rules,
sanctions-screening provider integration (recommend **ComplyAdvantage** — has a
pay-as-you-go/sandbox option — or **Chainalysis KYT** for on-chain-specific screening),
real-time platform health view.

**Acceptance criteria:**
- Every admin action (approve/reject/edit) is audit-logged with the acting admin's identity.
- Sanctions screening runs at KYC and again at withdrawal time, both logged.
- Admin dashboard reflects live counts (pending KYC, pending withdrawals, open disputes) with
  no caching lag beyond a documented, small TTL.

## MVP10 — Production Hardening — ⏳ designed

**Scope:** load testing (order placement, deposit/withdrawal throughput), external security
review/penetration test, Kafka evaluation for cross-service event fan-out (only adopted if
BullMQ's single-node throughput is demonstrated insufficient — see
`02-system-architecture.md §5`), DR/backup runbooks, full observability (Sentry + Prometheus +
Grafana dashboards for ledger integrity, withdrawal queue depth, chain-watcher health),
CI security scanning (Dependabot/`npm audit`), and the jurisdiction-by-jurisdiction legal/
compliance review gating `PLATFORM_MODE=live` per `01-PRD.md §8`.

**Acceptance criteria:**
- Load test report checked into the repo with pass/fail against defined SLOs.
- Penetration test findings tracked to closure (or explicit accepted-risk sign-off) before any
  `PLATFORM_MODE=live` deployment.
- Every jurisdiction the platform intends to operate in has a documented legal review outcome
  before it is enabled.

## MVP11–MVP23 — Investment Management platform

The addendum in `docs/12-investment-management-architecture.md` reshapes the platform into two
first-class modes: **self trading** and **investment management**. Execution moves to a
liquidity-aggregation model (`docs/13`), and the full money flow — investor deposit through real
execution and back out to withdrawal — is specified posting-by-posting in `docs/14`.

**This supersedes the previous MVP11 (segregated Managed Accounts).** The structural reversal is
documented at `docs/12` §0.2: the requested Master Strategy / NAV / allocation model is a pooled
fund, which is incompatible with the segregated design doc 10 chose. What carries forward
unchanged: the risk-disclosure consent flow (already shipped and working), the **hard 10% max
drawdown ceiling**, and the **backtest-before-live gate** from `docs/11`.

**Ordering principle:** NAV, units and the segregation invariant land *before* any manager can
trade investor capital. Building the terminal first would mean trading money the books cannot
yet correctly attribute.

### MVP11 — Investment Accounts — ✅ done
Accounting entities (`PENDING_SUBSCRIPTION` / `STRATEGY_POOL` / `PLATFORM_TREASURY` /
`PLATFORM_REVENUE`), the DB-level trigger forbidding any pool→platform crossing outside the
named fee types, `InvestmentStrategy`, `InvestmentPosition`, `NavSnapshot`,
`SubscriptionRequest`, `FeeAccrual`.

*Acceptance — met.* 25 tests, every one of which writes **raw SQL with no service in the path**,
because the claim is "the database refuses", not "the application declines":
- the same pool→platform movement is refused under `ADJUSTMENT`, `TRANSFER_INTERNAL`, `TRADE`,
  `DEPOSIT`, `WITHDRAWAL`, `SUBSCRIPTION_SETTLEMENT`, `REDEMPTION_SETTLEMENT` and `P2P_RELEASE`,
  and accepted under `FEE_CRYSTALLISATION` and `TRADING_FEE`;
- refused too when the platform leg is a 1-unit rounding-sized leg hidden among legitimate ones;
- `perfFeeBps > 5000` and `maxDrawdownBps > 1000` rejected by CHECK constraints;
- `hwmUnitPrice` cannot decrease; NAV snapshots cannot be edited or deleted; a fee accrual's
  rate, base, HWM and amount are frozen after insert and crystallisation happens once;
- a `STRATEGY_POOL` account cannot exist without a strategy, a user bucket cannot carry one, and
  a strategy cannot have two pool accounts for the same asset.

*Bug found by these tests:* the `ledger_accounts_personal_unique` partial index from MVP2
predated pools and treated every `managedAccountId IS NULL` row as personal, which capped the
platform at **one strategy per asset** — the second strategy to hold USDC was rejected outright.
Narrowed in migration `20260814200200_scope_personal_account_uniqueness`.

### MVP12 — Investment Marketplace — ✅ done
`InvestmentStrategy` with every economic term as configuration, a publication workflow behind
two gates, the investor-facing marketplace and detail page, and a forbidden-claims gate over all
user-facing copy.

*Acceptance — met.* 25 e2e tests driving the gates through the API rather than asserting the
service contains a check:
- **Backtest gate.** `OPEN` is refused with no backtest, refused when the backtest drew down
  further than the strategy advertises (a 10% product cannot be justified by a run that lost
  30%), and refused through the generic status setter as well as the dedicated route — two
  doors to the same room, both locked. On success the audit row records the measured and
  configured drawdown side by side.
- **Forbidden-claims gate.** Promises of outcome are rejected in English and Russian, at
  creation *and* again at publication, with the offending field and matched text returned so an
  author can fix it. 35 unit tests cover the patterns.
- **Terms disclosed before an amount field exists**, straight from the fee engine — the
  frontend hardcodes no rate.
- **No fabricated track record**: AUM, NAV and performance are `null` until the NAV engine
  strikes a snapshot, and the UI says "there is none yet" rather than drawing a chart of zeros.
- Economic terms freeze once an investor holds the strategy; descriptive copy stays editable.
- `SEGREGATED_COPY` is refused at creation rather than silently producing a strategy with no
  accounting behind it.

*Two bugs found while building it:*
- The Russian half of the claims gate matched **nothing**: `\b` is defined over `[A-Za-z0-9_]`,
  so every Cyrillic letter reads as a non-word character and the boundaries landed wrong. Now
  `\p{L}` with the `u` flag.
- The same rules would have blocked the *required* disclaimer — "прошлые результаты не
  гарантируют будущих", "past results do not guarantee future returns" — forcing authors to
  delete their own risk warning. Negation is now checked in a window around the match, with a
  bare "no" deliberately excluded so "No fees, guaranteed profit" is still caught.

Also fixed: `MarkdownLite` rendered each hard-wrapped source line as its own block, which split
the risk disclosure's warning callout mid-sentence and dropped its tail out of the warning box
into plain body text.

### MVP13 — Master Strategy Account — ✅ done
Pool cash, subscription and redemption at dealing points, the `PENDING_SUBSCRIPTION` bucket, and
the unit register.

*Acceptance — met.* The dilution test is real: Alice invests 1000 at inception (1000 units), the
pool gains 500, Bob invests 1500 and receives exactly **1000** units at the struck price of 1.50
— not the 1500 a stale price would have given him, which would have moved 300 from Alice to Bob.
The test asserts both directions and the counterfactual. A second test covers the mirror case:
capital committed *before* a gain but settled after it deals at the new price too, because it
sat in `PENDING_SUBSCRIPTION` and was never at risk.

Also covered: consent required before investing, the maximum applied to total exposure rather
than per transaction, full no-fee refund on cancellation, idempotent retries, inception pricing,
an unpriceable (wiped-out) pool refusing to deal, immutable valuations with a recorded source,
lock-up and notice periods, proportional cost-basis return, and redemptions **queuing** rather
than being paid from platform funds.

*Two bugs found by the invariant test:*
- Units are computed by division, so `400 / 1.2` is a repeating decimal. Rounding happened once
  when a position row was written and again, differently, when the same value went into
  `totalUnits` — leaving `Σ units == totalUnits` false by ~1e-17 per uneven deal. Values are now
  quantised once, downward, before either write: rounding *up* would issue more units than the
  money paid for and dilute every existing holder.
- Prisma's `{ increment }` does not preserve full decimal precision on a `Decimal(36,18)`
  column. `totalUnits` is now computed in Decimal and written under a `FOR UPDATE` lock, which
  also closes the lost-update race that a read-modify-write on a shared counter always has.

### MVP14 — Allocation Engine — ✅ done
Derived per-investor exposure, dealing-point flow netting, pro-rata wind-down.

*Acceptance — met.* Σ derived exposures equals pool exposure **exactly** at 10,000 positions
with deliberately uneven weights (so nearly every share is a repeating decimal), computed in
~3.6s — fast enough to stay a derived-on-read projection rather than a stored one that could
drift.

The engineering here is one function, `apportion`: the naive `total × wᵢ / Σw` does not add up.
Floor every share and the parts fall short; round to nearest and they can overshoot. Either way
`Σ parts ≠ total`, which in a fund means value shown to nobody or the same value shown to two
people — and since exposure is recomputed on every read, the discrepancy is permanent rather
than transient. Largest-remainder (Hamilton) apportionment fixes it: floor, then hand the
shortfall out one ulp at a time to whoever was rounded down hardest, ties broken on a stable key
so two runs of the same report never disagree.

Also: flow netting tells the manager what the next dealing point will do to pool cash **before**
it happens (finding a shortfall during settlement means queueing a redemption an investor was
told to expect), and wind-down distributes pro rata with an endpoint that accepts no amount and
no recipient — a test posts `{amount: 999999, recipient: …}` and confirms the body is ignored.
Wind-down is refused while positions are unliquidated, and is admin-only: an investment manager
cannot close a fund.

*Bug found while building it:* `sumApportioned` — the helper exported so callers can **assert**
exactness — accumulated in a default `Prisma.Decimal`, which keeps 20 significant digits and
silently dropped the tail of any total above ~100. The verification helper was itself the lossy
step, and it made a correct apportionment read as wrong. Intermediates now use a
high-precision Decimal clone.

### MVP15 — NAV Engine — ✅ done
Scheduled and event-driven revaluation, immutable `NavSnapshot`, sourced marks with provenance.

*Acceptance — met.* `navPerUnit` is written by `NavService` and nowhere else — it is not a column
on `investment_strategies` at all, so there is no field to hand-edit. And a manager-supplied
price is not rejected so much as **unrepresentable**: `strikeSnapshot(strategyId, isDealingPoint)`
takes no price, `MarkRegistry` exposes no setter, and a test asserts both signatures so a future
refactor cannot quietly add one.

Prices come from a `MarkProvider` chain: `identity` (an asset against itself needs no feed) then
CoinGecko, verified against the **live public API** alongside the existing live-Sepolia tests.
Cross-rates go through USD; every mark carries its provider and the provider's own observation
time, and both are stored per-asset on the snapshot — a historical NAV without provenance is an
assertion nobody can check, and a performance fee computed from it is indefensible.

**The refusals are the milestone.** Valuation fails rather than:
- valuing an unpriceable holding at zero (which understates NAV, every investor's stake, and the
  fee base — wrong in a direction someone benefits from);
- using a stale price (age judged on the provider's `asOf`, never on when we called — a dead feed
  answers instantly with yesterday's number);
- dividing by a zero or negative quote.

The Redis mark cache stores `asOf` and re-checks age on read, so a cache hit cannot launder a
stale price into a fresh-looking one. Scheduled revaluation marks every live strategy and reports
per-strategy failures rather than letting one dead feed block the rest or leave a strategy
silently stuck on an old NAV.

`DealingService` now delegates to the engine: **one valuation path**, because two ways to value a
pool is two answers to "what is this worth?".

*Naming bug found by the tests:* the dealing-point parameter was called `markSource` and an
operator's value was written onto the snapshot as its provenance. Renamed to `reason` — it is an
audit-log note about *why* a deal was struck, and it now sits in the audit trail while the
snapshot carries the engine's own provenance. The old name implied an operator supplies marks,
which is exactly the confusion this milestone exists to prevent.

*Also deliberate:* `identity` does **not** mark stablecoins at par against each other. USDT is
not definitionally worth 1 USDC, and assuming so would overstate NAV during a depeg — precisely
when the number matters most.

### MVP16 + MVP17 — High Water Mark, and the fees on top of it — ✅ done
Built as one piece: an HWM with nothing accruing against it is half a feature, and the two share
every test.

*Acceptance — both met.* The **docs/12 §6.1 table runs as a test**, step for step: invest at
1.00, gain to 1.20, crystallise (HWM ratchets to 1.20), fall to 1.10, recover to 1.20 — **zero
accrued** — then gain to 1.25 and accrue on the 0.05 only. And crystallising one investor's fee
leaves every other investor's `navPerUnit` **exactly** unchanged, asserted to 18 decimal places
with a second investor in the pool.

Four decisions carry the design:

1. **The performance fee is marked to market, not summed.** Each run recomputes the target
   liability and records the *delta*. Running the job twice must not charge twice, and the delta
   can be negative — when NAV falls back, the un-earned accrual is released, as a new row, since
   `fee_accruals` is append-only. Σ of the rows equals the accrued balance, so the audit trail
   reconciles to the state.
2. **Accruals are not ledger postings.** An accrual moves nothing. Posting it would drag every
   *other* investor's `navPerUnit` down for a fee they do not owe.
3. **Crystallisation is paid in units.** The payer's units are cancelled and the matching cash
   leaves the pool, so `(N − f) / (U − fU/N) = N/U` — the unit price does not move for anyone
   else. On a redemption the fee is instead carved out of the gross proceeds, which has the same
   property and cancels no extra units.
4. **The HWM ratchets only when the fee is actually paid.** A position the pool cannot fund is
   skipped, not part-paid; ratcheting there would forfeit the investor's protection without the
   platform collecting.

The manager can accrue (bookkeeping) but **not** crystallise — that is ADMIN+, because the
manager is the beneficiary of the charge. Neither endpoint accepts an amount. The redemption path
now deducts the pro-rata accrued fee, as its own `FEE_CRYSTALLISATION` posting: the ownership
boundary does not let `REDEMPTION_SETTLEMENT` cross to a platform account, and the trigger caught
the first attempt to make it do so.

*The bug this milestone found, and it is the significant one:* **`Prisma.Decimal` is capped at 20
significant digits, and the cap applies to `plus` and `minus`, not only to multiply and divide.**
A `Decimal(36, 18)` balance spends 18 digits after the point, so
`10000.123456789012345678 + 1e-18` silently returns `10000.123456789012346` — three decimal
places gone from a five-figure balance. This was **not** confined to the new code: the ledger's
own "does this transaction balance?" check accumulated with `.add()`, `adjustTotalUnits` summed
with `.plus()`, and every `Σ units == totalUnits` invariant was a chain of them. Fixed with
`exactSum` / `exactDiff` / `exactNeg` in `ledger/amount.util.ts` (accumulate at 60 digits,
quantise once) and swept across ledger, wallet, deposits, custody reconciliation, dealing,
allocation, subscriptions and fees. `amount.util.spec.ts` pins each helper against the raw
operator it replaces, so the failure mode stays visible.

*Also found:* the e2e suites all truncate one shared Postgres database in `beforeEach` and Jest
was running them in parallel, so they wiped each other — producing 143 misleading failures
(unrelated 404s, phantom reconciliation mismatches). `maxWorkers: 1` is now pinned in
`jest-e2e.json` rather than passed on the command line, so a green run means something however
the suite is invoked.

### MVP18 — Manager Trading Terminal
AUM overview, per-strategy capital, positions, order entry, SL/TP, exposure and risk panels.
*Acceptance:* the terminal has no endpoint that accepts an arbitrary transfer; a trader assigned
to strategy A cannot trade strategy B.

### MVP19 — Risk Engine
The full pre-trade pipeline for **both** modes, emergency controls, dual-control on limit
changes. *Acceptance:* every check blocks an order that violates it, proven per check; the 10%
circuit breaker fires under a simulated drawdown.

### MVP20 — Investor Reporting
Monthly/trade/performance/fee/transaction statements and tax export, generated from ledger and
NAV snapshots. *Acceptance:* a regenerated historical statement is byte-identical to the one
issued at the time.

### MVP21 — Custody Integration
Qualified custodian or institutional MPC. *Acceptance:* no private key material exists in
PostgreSQL under any configuration; live mode refuses a dev signing provider.

### MVP22 — Institutional Execution
`ExecutionVenue` adapters, smart order routing, execution-quality measurement, venue↔ledger fill
reconciliation. *Acceptance:* an unmatched venue fill halts trading on that venue and raises an
incident.

### MVP23 — Production Compliance
KYC/AML, sanctions screening, investor eligibility and jurisdiction restrictions, suitability
checks, investment agreements, consent records, and the licensing review that must clear before
pooled investment management is offered to anyone. *Acceptance:* `PLATFORM_MODE=live` cannot be
enabled for the investment module without a signed attestation naming the jurisdictions cleared.

---

## Track B — Hybrid exchange (MVP24–MVP31)

Added by `docs/15-hybrid-exchange-addendum.md`. Nothing in MVP1–MVP23 is dropped; this is a
second product surface over the same ledger, identity and risk engine.

**Read `docs/15` §0 first.** It records three places where the hybrid-exchange spec contradicts
what is already built, and which side wins:
1. **Self-custody keys vs. managed pools** — both, as a per-account `custody_mode`. A manager
   cannot trade assets the platform is structurally unable to sign for, so investment products
   and escrow exist only on custodial accounts.
2. **Own order book vs. liquidity aggregation** — both, as a per-market `execution_mode`
   (`INTERNAL_BOOK` / `ROUTED` / `HYBRID`). That is what "hybrid exchange" means.
3. **The 50/50 profit share is a property of an investment strategy**, not a platform-wide fee.
   Spot and P2P carry their own disclosed maker/taker fees.

Ordering principle, unchanged: **the ledger and its constraints land before anything that moves
money through them.** The matching engine is deliberately not first — an engine with nothing safe
to settle into is a demo.

### MVP24 — Telegram Mini App authentication
`initData` validated by HMAC-SHA256 against the bot token, in constant time, with a 60-second
freshness window and a monotonic `last_auth_date` so a replayed payload is refused even inside
it. Access token in memory only; refresh token `HttpOnly; Secure; SameSite=Strict`.
*Acceptance:* a tampered payload, a stale payload, and a replayed payload are each 401 — proven
by test, not by inspection. No token appears in `localStorage` or `sessionStorage` (asserted in
a browser test).

### MVP25 — TMA shell
`@telegram-apps/sdk`: viewport-safe insets, Telegram theme mapped onto the existing design
tokens, hardware Back button wired to the router, `MainButton` as the primary action.
*Acceptance:* the app is usable at Telegram's smallest viewport with no horizontal overflow, and
Back navigates rather than closing the app.

### MVP26 — Self-custody wallet
Client-side BIP-39 generation via Web Crypto, AES-GCM under a PBKDF2 key (≥100k iterations), and
a server that stores only an undecryptable blob with its KDF parameters beside it.
*Acceptance:* no code path transmits a mnemonic, key or PIN — asserted by a test that inspects
every outbound request during wallet creation. `custody_mode` is visible on every balance, and
investment/escrow endpoints refuse a `SELF_CUSTODY` account.

### MVP27 — Markets and order lifecycle
`markets`, `orders`, `trades`. Funds are locked in the ledger **before** an order becomes `OPEN`
— enforced by a CHECK constraint, so an unfunded open order cannot exist.
*Acceptance:* an order placed with insufficient balance never reaches `OPEN`; ten concurrent
orders against one balance leave exactly one funded.

### MVP28 — Matching engine (Rust)
In-memory book, price-time priority, FIFO within a level, deterministic sequencing from a durable
command log with periodic snapshots to bound replay.
*Acceptance:* property tests for FIFO fairness and quantity conservation; killing the engine
mid-session and replaying the log reproduces the identical book. The engine holds no balances and
has no path to move value.

### MVP29 — P2P escrow
Ads, orders, ledger-backed escrow locked at order open, durable payment-window timers, TOTP on
release, and dispute arbitration as a typed audited posting.
*Acceptance:* a restart does not strand locked funds; an expired window unlocks them; the same
balance cannot be sold twice; no operator can move escrow by hand.

### MVP30 — Fiat gateway and equities
Provider abstractions for fiat on/off-ramp and a broker adapter (Alpaca-shaped), with trading
hours and corporate actions.
*Acceptance:* a completed fiat transfer that has not posted to the ledger is impossible (CHECK
constraint); provider callbacks are idempotent on `(provider, reference)`.

### MVP31 — Hardening pass
Everything in `docs/16` Part 2 verified rather than asserted: rate limits under load, WebSocket
handshake auth and backpressure, the framing split between website (`DENY`) and TMA
(`frame-ancestors`), the automatic 24h withdrawal freeze after three 2FA failures, and a test
proving the security logger cannot emit key material.
*Acceptance:* an external penetration test, findings tracked to closure or explicit accepted-risk
sign-off, before any `PLATFORM_MODE=live` deployment.

---

## Track C — AI Trading Intelligence (MVP32–41)

Added 2026-08-15. Supersedes the MVP6 signal-engine plan, which `docs/07` described and
`docs/17–19` replace. The ordering below is a dependency chain, not a preference: each phase
makes the next one *verifiable*, and skipping to the models produces a system whose output
cannot be evaluated. See `docs/19` §9 for the same table with its gates.

### MVP32 — Point-in-time data platform — ✅ done
Dual `eventTime` / `ingestTime` on every record, macro as append-only vintages, measured
source-reliability scoring, and the data quality gate. 33 tests, against live OKX/Coinbase and
real PostgreSQL.

*Acceptance — met.* The guarantee is enforced by a **CHECK constraint**, not by service code:
`market_candles.ingestTime >= closeTime`, so a row asserting the platform knew a bar before it
closed cannot be stored — including by a backfill script that bypasses every service, which is
how this rule actually gets broken. `macro_observations` carries the same constraint against
`releaseTime`, which is what stops a provider's history endpoint back-filling a *revised* CPI
figure under the original release date. Both tables are append-only by trigger.

`CandleRepository` is the only read path and every method takes a mandatory `asOf`, filtering on
`ingestTime`. There is no event-time filter available and no default of "now" — a developer
writing the lookahead version has to do it deliberately rather than by forgetting.

**Findings from building it, all three from calling real endpoints:**

1. **Binance and Bybit are geo-blocked** from this deployment; `docs/17` §5 had recommended
   Binance first. OKX is now primary, Coinbase secondary. A provider recommendation in a design
   document is a hypothesis until something calls the API.
2. **OKX's `1D` bar opens at 16:00 UTC**, Coinbase's at 00:00 — the two venues shared *zero*
   daily bars, so the cross-check compared nothing while still reporting success. Fixed by
   anchoring every platform timeframe to UTC; a test now asserts a non-empty overlap.
3. **The outlier detector could not detect outliers.** A spike produces two extreme returns, in
   and out; with ~60 bars those two dominate the variance meant to catch them, and a 20% jump in
   a flat series scored 5.4σ against a 10σ threshold. Replaced with the Hampel identifier
   (median/MAD, 50% breakdown point). Caught by a test built from exactly that series.

*Deferred honestly:* TimescaleDB is unavailable in this Postgres, so the tables use BRIN indexes
on time; converting to hypertables is one call and no interface change.

### MVP33 — Feature engine — ✅ done
One implementation serving both backtest and live. **119 versioned features** on the anchor
timeframe across six computable-from-OHLCV families, expanding past 800 columns once
higher-timeframe context is folded in. 40 kernel unit tests against reference definitions, 30 e2e.

*Acceptance — met.* A vector computed live, recorded, and recomputed offline reproduces the
identical hash and identical values in every column. Getting there took two real fixes, both
found by the acceptance test itself:

1. **The feature contract was not self-describing.** `featureSetVersion` named the anchor and
   context sets but nothing recorded *which* context timeframes were actually used, so
   recomputation fell back to the default set — several hundred extra all-null columns and a
   different hash. The check reported skew where none existed, which is worse than no check: a
   verification that cries wolf gets the first real finding waved through. `contextTimeframes` is
   now stored on the record and replayed exactly.

2. **Prisma's `Json` column does not round-trip an IEEE-754 double.** Writing
   `11.154987603973913` and reading it back yields `11.15498760397391` — one digit gone somewhere
   between the query engine and JSONB. Invisible in almost any other application; fatal here,
   because the skew check compares exactly and would have failed on every vector forever. Values
   are now stored as their canonical 17-significant-digit text, which is the same serialisation
   the hash already used — one representation instead of two ways to disagree. Confirmed with a
   direct probe against the Prisma client rather than assumed.

Other properties the tests pin: warmup is enforced (a 200-EMA over 120 bars is null, not a
plausible wrong number); absence is never encoded as zero; a null column and an absent column
hash differently; higher timeframes enter only via bars that have closed; a missing higher
timeframe becomes null columns rather than vanishing, so the model can tell "the 4h said nothing"
from "there was no 4h"; and timeframe conflict is represented (`tf_conflict = 1` on a split vote)
rather than averaged into a weak reading of whichever side is marginally ahead.

*Also fixed:* one e2e test registered three investors with `Promise.all`, standing up nine
concurrent supertest listeners, and reset connections late in a full-suite run once enough
sockets had accumulated in TIME_WAIT. It was testing the unit register, not concurrency, so the
parallelism bought nothing and cost a flake.

*Deferred honestly:* order-flow, derivatives, on-chain, macro and news features are declared in
`docs/17` §3.2 and **not built** — they need data the platform does not ingest yet (MVP32 covers
OHLCV only). They are absent rather than stubbed, so nothing reports a value it does not have.

### MVP34 — Labelling and validation harness — ✅ done
Triple-barrier labels, meta-labelling, purged and embargoed CV, uniqueness weights, walk-forward,
deflated Sharpe against a harness-owned trial counter, PBO, and the negative controls. A
regularised logistic regression ships as the mandatory baseline — without something to train, a
control asserting "shuffling must destroy performance" cannot be run at all. 47 unit tests, 21 e2e.

*Acceptance — met.* Both controls behave: permuting the labels centres the AUC on chance, and
handing the model the next bar's features **improves** it. There is also a test of the detector
itself — a dataset whose feature *is* the label fails the shifted-feature control with a
"lookahead leak" verdict, so the control is shown catching the thing it exists for rather than
merely passing on clean data.

**Design decisions the tests pin:**

- **An ambiguous bar resolves pessimistically.** One bar spanning both barriers with no finer path
  to say which came first is assumed to be the stop. Assuming the target turns every violent bar
  into a win, is worth an enormous amount of fictional performance, and is almost never noticed
  because the resulting curve looks merely very good.
- **Timeouts are dropped, not folded into one side.** Calling a timeout "not up" teaches the model
  that a flat market is a short.
- **Barriers are sized from bars strictly before entry** — including the entry bar's own return
  would size the barrier using the move it is about to measure.
- **The trial counter is append-only and scoped.** A counter that can be decremented is not a
  counter, and deleting a disappointing run is precisely what the deflated Sharpe prices in.
- **The verdict is written to decline.** On a synthetic random walk it says so, in words.

**Three fixes found by the tests:**

1. **The shuffled-label control was not a test.** A single permutation is one draw from the null
   distribution; comparing it to a fixed threshold fails on ordinary noise, since AUC's standard
   error on a few hundred overlapping labels is easily 0.05. It is now a real permutation test —
   ten draws, the mean checked against chance, and a p-value against the baseline.
2. **A backfill was invisible to every historical query.** Stamped `ingestTime = now`, the
   point-in-time filter correctly reported that nothing was knowable two weeks ago, so a research
   dataset built from fresh history came back empty. Resolved with an explicit `'bar-close'`
   ingest policy, valid **only** for non-revised sources like exchange OHLCV and documented as
   forbidden for macro and on-chain data. Explicit rather than inferred, because the wrong answer
   here is silent.
3. **OKX caps a page at 300 bars**, which is under two weeks of hourly data — not enough to label,
   split and walk forward over. The provider now paginates backwards through `/history-candles`;
   verified at 1200 contiguous bars with zero gaps.

*A correction to my own reasoning:* I first asserted that fat-tailed, negatively skewed returns
always deflate a Sharpe harder, and wrote a test for it that failed. Below the expected-maximum
Sharpe the relationship inverts, correctly — wider standard error means less confidence that the
result is *under* the bar. The test now checks the regime the metric is actually used in.

*Deferred:* the meta-labelling path is implemented and unit-tested but not yet wired into the
walk-forward runner, which trains the primary only. Sequence models, ensembling and calibration
are MVP36.

### MVP35 — Event-driven backtester
Replay clock with a data view that structurally cannot return the future; fees, spread,
size-dependent slippage, partial fills, latency, funding, liquidity caps and market impact.
*Acceptance:* a zero-cost run and a realistic-cost run differ materially on the same strategy;
attempting to read a future bar is a type error, not a convention.

### MVP36 — Models, calibration, ensemble, regime
LightGBM primary and meta models, a mandatory logistic-regression baseline, per-domain models,
a stacked regime-aware combiner trained on out-of-fold predictions only, isotonic calibration,
and the causal regime classifier.
*Acceptance:* the ensemble beats the baseline out-of-sample, and the calibration curve holds —
the 0.7 bucket resolves near 0.7. An uncalibrated model does not pass.

### MVP37 — Model registry, drift, paper and shadow
Full lineage per version, artefact hashing checked on load, the seven-state status ladder, drift
monitoring (PSI, calibration decay, realised-vs-expected R) with graduated automatic response.
*Acceptance:* a drifting model is size-reduced then quarantined without human action, falling
back to the previous production version; a running artefact whose hash does not match the
registry takes trading offline.

### MVP38 — Signal engine
EV gate net of real costs, tiers A+/A/B/C/NO TRADE derived from pipeline outputs, attribution-
derived explanations, append-only `signals` table.
*Acceptance:* a signal row is written before its outcome is knowable and cannot be updated
(trigger, as with `nav_snapshots`); conflicting inputs produce NO TRADE; the explanation is
generated from SHAP values and per-domain probabilities, never composed separately.

### MVP39 — Portfolio optimiser and risk engine
Risk-contribution exposure rather than notional, correlation clusters with their own budget,
beta-to-BTC cap, the six-term position-size minimum, stops mandatory before fills.
*Acceptance:* every pre-trade check blocks a violating order, proven individually per check; two
highly-correlated candidates do not both size to full; no automated position can exist without a
stop.

### MVP40 — Auto-trading and execution
The gated enable flow, server-side limit enforcement, the four modes, execution-quality
measurement feeding back into the slippage model, and the full kill-switch matrix.
*Acceptance:* the kill switch stops new orders under load without market-closing open positions;
a market-data failure halts entries; a position/venue divergence halts new orders; a client
sending a size above the user's configured limit is rejected server-side.

### MVP41 — Research Lab and performance surfaces
Operator-only lab with dataset/feature/model selection, walk-forward runs, SHAP importance,
strategy correlation; investor-facing performance with the calibration chart.
*Acceptance:* every experiment increments the trial counter that deflates the reported Sharpe;
the lab cannot write to the production registry, only submit a promotion request; every displayed
figure is a view over `signal_results` with no writable aggregate anywhere.

**Data dependencies.** Phases 32–38 are buildable entirely on free sources (exchange public APIs,
Deribit, DefiLlama). A real macro engine needs a paid calendar with consensus and vintages
(~$100–500/mo); a real on-chain engine needs flow and whale data (~$300–1500/mo); order-flow
*models* need historical L2 (~$500–2000/mo) — deliberately deferred, since live capture is free
and should be accumulated forward first. See `docs/17` §5.

---

## How to pick up MVP2

1. `apps/api/prisma/schema.prisma` already has the MVP2 tables (`wallets`,
   `wallet_addresses`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `balances`,
   `deposits`, `chains`, `assets`) — start from the schema, not a redesign.
2. Implement `BlockchainAdapter` for one EVM testnet chain first (fastest path to an
   end-to-end deposit demo), per `06-blockchain-architecture.md §1`.
3. Ledger service and its balance/idempotency tests should be written *before* wiring the
   chain watcher to it — the ledger's correctness does not depend on blockchain integration
   and should be provably correct on its own first.
