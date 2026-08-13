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

**Post-milestone gate:** see `CHANGELOG.md` for the review pass performed before merge.

---

## MVP2 — Wallet + Ledger + Deposit — ⏳ designed

**Scope:** `blockchain` module chain adapters (start with 1 EVM chain via viem +
Bitcoin testnet), `wallet` deposit-address issuance, `ledger` double-entry engine, deposit
detection/crediting end-to-end **in testnet/sandbox mode only**.

**Acceptance criteria:**
- Deposit address generation is deterministic and re-derivable from the same seed (recovery
  drill documented and tested).
- A ledger transaction is exactly balanced (sum of entries = 0) — enforced by a DB check
  constraint, not just application code, and covered by a property-style test that tries to
  violate it.
- Duplicate chain events (same tx hash/log index replayed) do not double-credit — test
  simulates a webhook replay and a queue-job retry.
- Balance projection (`balances`) matches a from-scratch recomputation from `ledger_entries`
  in a reconciliation test.
- UI clearly labeled "Testnet — no real funds" until a signed compliance attestation exists
  (`02-system-architecture.md §4`).

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
