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

## MVP2 — Wallet + Ledger + Deposit — 🚧 in progress (ledger + wallet done, chain deposits remain)

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
- [x] 87 automated tests passing (46 unit, 41 e2e against live PostgreSQL + Redis).

**Remaining for this milestone:**
- [ ] `BlockchainAdapter` implementations and chain watchers (start with one EVM testnet).
- [ ] Deposit address derivation and issuance per (chain, asset).
- [ ] Deposit detection → PENDING credit on first sight → AVAILABLE on required confirmations,
      keyed by `(chainId, txHash, logIndex)` for idempotency.
- [ ] Scheduled custody reconciliation comparing the EXTERNAL boundary balance against
      on-chain holdings, raising a `RECONCILIATION_MISMATCH` risk event on drift.

**Design decisions made during implementation** (both found by writing the tests, see
`CHANGELOG.md`):
- A `LedgerAccountType.EXTERNAL` platform-boundary contra-account was added: double-entry has
  no way to originate value without one, so a deposit was structurally impossible to record.
- `SET CONSTRAINTS ALL IMMEDIATE` is issued at the end of every ledger transaction, because
  Prisma swallows errors raised during its own COMMIT — without it a violated constraint
  correctly rolled the write back but reported success to the caller.

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

## MVP11 — Managed Accounts & Backtest-Gated Algorithmic Trading — ⏳ designed

**Scope:** see `docs/10-managed-accounts-architecture.md` and
`docs/11-backtesting-architecture.md` in full. In short: investors allocate capital to a
segregated, consent-gated sub-account that a manager/validated strategy trades on their
behalf, bounded by a hard 10%-of-capital max-drawdown circuit breaker; no strategy ever
reaches a live Managed Account without a passing backtest, a paper-trading observation
window, and (separately) a jurisdiction-specific legal review clearing discretionary trading
specifically — a heavier bar than the base custodial-exchange review in `01-PRD.md §8`, not
the same one.

**Depends on:** MVP2 (Ledger), MVP4 (Trading), MVP6 (Signal/Indicator Engine) — this is a
capstone feature, not something buildable in isolation from day one.

**Already shipped ahead of this milestone** (because the compliance precondition doesn't need
to wait for the trading machinery): the full data model (§9 of `docs/10`) and a real, working
`RiskDisclosureAgreement` / `RiskDisclosureAcceptance` flow — investors can read the current
risk disclosure and record explicit, audit-logged acceptance today, via `/api/v1/legal/*` and
the web app's Managed Accounts intro page. See the "Legal / risk disclosure" entry under MVP1
above for what was verified.

**Acceptance criteria (for the rest of the milestone):**
- No `ManagedAccount` can reach `ACTIVE` status without a current, accepted
  `RiskDisclosureAcceptance` for that investor — enforced server-side, tested by attempting to
  bypass via direct API calls.
- `maxDrawdownBps` is rejected above `1000` (10%) at every write path, not just the UI.
- The circuit breaker fires correctly under a simulated drawdown-crossing test — no new
  risk-increasing order can be placed on a `CIRCUIT_BROKEN` account, verified by attempting one.
- No `TradingStrategy` can be assigned to a live Managed Account without a `BacktestResult`
  clearing the documented promotion bar *and* a completed paper-trading window — tested by
  attempting to skip each gate independently.
- Fees are Admin Panel-configurable and shown to the investor before account authorization,
  never hardcoded.

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
