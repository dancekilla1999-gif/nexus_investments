# Changelog

## MVP2 — Double-entry ledger and wallet

**Date:** 2026-08-14

The accounting core of the platform. The roadmap's instruction for this milestone was to build
the ledger first and prove it correct *before* touching blockchain integration, on the grounds
that ledger correctness is a consistency problem that does not depend on chains at all. That is
what this delivery is.

### The ledger

`LedgerService` is the only write path for value anywhere in the platform — there is
deliberately no method that sets a balance directly. It guarantees three things:

1. **Conservation.** Every posting balances to zero per asset. Checked in the service for a
   useful error message, and enforced independently by a deferred PostgreSQL constraint trigger
   so that a bug in some future module still cannot write an unbalanced transaction. There is a
   test that bypasses the service entirely and writes raw SQL to prove the database refuses it.
2. **Idempotency.** A repeated `idempotencyKey` never applies twice — including when two
   callers race the same key concurrently and one loses on the unique index.
3. **No double-spend.** Postings against an account serialize on a row lock taken in
   deterministic id order (so concurrent postings cannot deadlock). Ten parallel attempts to
   spend the same balance leave exactly one succeeding.

Also enforced at the database level: financial history is append-only (`ledger_entries`,
`ledger_transactions`, `audit_logs`, `risk_disclosure_acceptances` reject UPDATE and DELETE by
trigger — corrections are compensating entries, never edits), user balances can never go
negative, and a partial unique index closes the NULL-distinctness gap that would otherwise have
allowed a user to hold two separate "available USDT" accounts silently splitting their balance.

The `balances` table was re-keyed 1:1 to the ledger account it describes, rather than to a
separate `(userId, assetId, type)` tuple that could drift from it. `verifyReconciliation()`
compares every stored balance against a from-scratch recomputation of its entries; a test
deliberately corrupts a projection to confirm the drift is detected rather than assumed away.

### The wallet

Balances, internal transfers between a user's own buckets, and asset listing — all posting
through the ledger. `LOCKED` and `PENDING` are rejected as user transfer endpoints server-side
(funds reserved against an order that the user can move back at will are not reserved at all).
A real Wallet page and live dashboard balances replace the previous placeholders.

A clearly-labeled **sandbox testnet faucet** credits play money so the wallet can be exercised
before on-chain deposits exist. It runs through the exact same double-entry path a real deposit
will — debit the platform boundary, credit the user — so it proves the deposit accounting
rather than bypassing it, and the API refuses it outright when `PLATFORM_MODE=live`.

### Two design flaws found by writing the tests

Both of these were discovered because the suite runs against a real PostgreSQL rather than a
mock, and both would have been considerably more expensive to find later:

- **There was no way to originate value.** Double-entry requires a deposit to debit *something*
  in order to credit a user, and every account type in the schema was one that must never go
  negative — so recording a deposit was structurally impossible. Fixed by adding a
  `LedgerAccountType.EXTERNAL` platform-boundary contra-account whose (negative) balance is the
  platform's cumulative obligation to its users — which is precisely the figure custody
  reconciliation will compare against on-chain holdings.
- **Prisma silently swallowed a constraint violation raised at COMMIT.** An unbalanced write was
  correctly rolled back by the deferred trigger, but the caller was told it had succeeded. On a
  financial API that is the difference between "your transfer was rejected" and "your transfer
  went through" — with no transfer. Fixed by issuing `SET CONSTRAINTS ALL IMMEDIATE` at the end
  of every ledger transaction, forcing the check to run inside the transaction where the error
  propagates normally. Verified empirically both ways before and after.

A third, smaller one: `Decimal.toString()` emits exponential notation for very small
magnitudes, so a balance of one wei serialized as `"3e-18"` and would have reached a user's
wallet screen verbatim. All amounts now cross the API as positional decimal strings, never as
JavaScript numbers (an 18-decimal value has no exact float64 representation).

### Verified

- [x] 46 unit tests, 41 e2e tests against live PostgreSQL + Redis — 87 total, all passing.
- [x] `npm run lint` and `npm run build` clean for both apps.
- [x] Six migrations apply cleanly from scratch; DB triggers verified directly in `psql` before
      any code was written against them.
- [x] Full browser verification against the production build: register → empty balances (no
      fabricated numbers) → faucet credit → internal transfer → overdraw correctly refused with
      a real error message → dashboard consistent with wallet. Screenshotted at each step.


## Managed Accounts foundation (design + real risk-disclosure consent flow)

**Date:** 2026-08-13

Product addition: investors who don't want to trade themselves can allocate capital to a
**Managed Account** that a manager/validated strategy trades on their behalf. This is a more
heavily regulated business than the base custodial exchange (discretionary trading of client
funds is investment-adviser / asset-management activity in most jurisdictions), so it's built
the same way everything regulated in this repo is: fully designed, gated behind explicit
compliance checks, and only the parts that are honest to ship *now* actually ship now.

### Added — design

- `docs/10-managed-accounts-architecture.md`: segregated per-investor sub-accounts (never a
  pooled fund), the risk-disclosure consent gate, a hard 10%-of-capital max-drawdown circuit
  breaker (high-water-mark based, platform-ceiling enforced server-side, not just in the UI),
  ledger integration, trade fan-out execution, and fee model.
- `docs/11-backtesting-architecture.md`: no strategy ever reaches a live Managed Account
  without a passing historical backtest (walk-forward, no look-ahead, realistic fees/slippage,
  survivorship-bias-free pair universe) *and* a minimum live paper-trading observation window.
  Historical data sourced from Binance's free public klines API (CoinMarketCap's historical
  OHLCV requires a paid Enterprise plan — an intentional, documented provider split from the
  live top-25 ranking, which stays on CoinMarketCap).
- `docs/09-roadmap.md` MVP11 milestone with acceptance criteria; non-goals and companion-doc
  list in `docs/01-PRD.md` updated to reference both new documents.
- Full data model: `RiskDisclosureAgreement`, `RiskDisclosureAcceptance`, `ManagedAccount`,
  `TradingStrategy`, `BacktestRun`, `BacktestResult`, plus a nullable `managedAccountId` on
  `ledger_accounts`/`orders` and new `RiskEventType`/`NotificationType` values — additive
  migration, schema-only until MVP11 except where noted below.

### Added — real, working code (ships now, not gated behind MVP11)

The risk-disclosure consent flow doesn't depend on wallet/ledger/trading, so it's built for
real today rather than waiting for the milestone that needs it:

- **`LegalService`/`LegalController`** (`/api/v1/legal/risk-disclosure/*`): a public endpoint
  to read the current agreement (a prospective investor shouldn't need an account to see it),
  an authenticated status check, and an idempotent, audit-logged accept action. No update/
  delete path exists for an acceptance record — same immutability convention as `AuditLog`.
  `assertCurrentAgreementAccepted()` is exported now as the guard MVP11's account creation
  will call.
- A real Managed Accounts page in the web app: reads and renders the current agreement (a
  small, dependency-free markdown-lite renderer — no `dangerouslySetInnerHTML`, every
  character renders as text, never as injected markup), records acceptance, shows the
  persisted "Accepted on …" state on reload, and is honest that account creation itself isn't
  built yet, with the real bullet points from the roadmap.
- A clearly-labeled **draft placeholder** risk disclosure document is seeded (never real legal
  copy presented as final — see `docs/10 §3`) so the flow is exercisable end to end.
- 4 new e2e tests (`test/legal.e2e-spec.ts`) + 7 new unit tests (`legal.service.spec.ts`):
  public read, unauthenticated-accept rejection, idempotent accept (no duplicate row, no
  double audit-log entry), status reflecting the persisted acceptance. 54 automated tests
  total now (41 unit + 13 e2e), all passing.
- Verified live: registered a user, opened Managed Accounts from the sidebar, read the
  disclosure, accepted it, reloaded the page, and the acceptance was still there — zero
  console errors (Playwright against the production build, screenshotted).

### Why the account itself isn't buildable yet

`ManagedAccount`/`TradingStrategy`/`BacktestRun`/`BacktestResult` have no service logic behind
them on purpose — they need the Ledger (MVP2), Trading (MVP4), and Signal/Indicator Engine
(MVP6) this repository hasn't built yet. Faking a "create account" button ahead of a ledger
that can actually hold segregated funds would be exactly the kind of fake fintech this project
is built not to do.

---

## MVP1 quality hardening pass

**Date:** 2026-08-13

Treated as a production financial application from the start, not a demo — this pass went
back over the initial MVP1 delivery below and raised the bar on both the backend and the
interface rather than adding new product surface.

### Backend

- **Rate limiting is now genuinely Redis-backed**, not `@nestjs/throttler`'s in-memory default
  (which silently stops enforcing correctly the moment the API runs as more than one
  instance). `RedisThrottlerStorage` (`apps/api/src/redis/`) applies the hit-counter
  increment, TTL, and block flag atomically via a single Lua script — verified with a
  dedicated test suite that includes a real concurrency check (20 parallel increments, no lost
  updates) against a live Redis instance.
- **Structured JSON logging** via `nestjs-pino`, with a request-correlation ID that threads
  through access logs, application logs, and the client-facing error body — pretty-printed
  locally, raw JSON in production for the log aggregator.
- **Explicit allow-list response serialization**: `UserResponseDto` (`class-transformer`,
  `excludeExtraneousValues`) replaced the previous destructure-out-the-secrets pattern in
  `UsersService`/`AuthService` — a new sensitive column added to the `User` model in the
  future can't leak through a handler that forgot to strip it, because nothing is exposed
  unless explicitly decorated. Backed by a global `ClassSerializerInterceptor` as a second
  layer.
- **Prisma-aware error mapping**: unique-constraint and not-found errors now map to clean
  409/404 responses through the same error contract as everything else, instead of leaking as
  generic 500s.
- **Field-level validation errors**: the global `ValidationPipe`'s `exceptionFactory` now
  returns a flat, field-addressable error list (`{field, messages}[]`) instead of a prose
  array, so a client can highlight the exact input that failed.
- Compression, environment-aware Helmet CSP (relaxed only for the non-production Swagger UI),
  graceful shutdown hooks.
- Removed a config knob that looked live but wasn't: `THROTTLE_LIMIT_AUTH` was declared in
  `.env.example`/`env.validation.ts` but nothing ever read it — the actual stricter limit on
  auth routes is a static `@Throttle()` override in `auth.controller.ts`. Deleted the fake
  knob rather than leave a setting that silently did nothing.
- **New end-to-end test suite** (`apps/api/test/auth.e2e-spec.ts`, supertest) exercising the
  full HTTP pipeline — guards, pipes, filters, interceptors, everything `configure-app.ts`
  wires up — against a live PostgreSQL and Redis: registration, secret-field leakage checks,
  duplicate-email conflicts, field validation, unauthenticated-route rejection, login +
  refresh rotation + replay detection (including that a replay revokes the *new* session too,
  not just rejects the reused token), 2FA enrollment and gated re-login, rate-limit
  enforcement, and health-check dependency reporting. 9/9 passing, run alongside the existing
  33 unit tests.

### Frontend

- **Full authenticated app shell**: sidebar + topbar navigation spanning the entire product
  information architecture (Wallet, Trading Terminal, P2P, Markets, AI Signals, Portfolio,
  Orders, Transactions, Subscriptions, Security Center, Profile) — not just a single dashboard
  page. Every not-yet-built section renders a genuine, per-module "ships in MVP-N" page (with
  real design bullets pulled from the roadmap) instead of a blank stub or a 404.
- **Security Center and Profile are now real, functional pages** — 2FA enroll/confirm/disable,
  live device list with revocation, and profile editing all wired to the actual API, moved out
  of the dashboard into their own IA sections.
- **Light/dark theme toggle** with a render-blocking inline script to avoid a flash of the
  wrong theme on load.
- **Toast notification system** (own implementation, no dependency) for action feedback
  (2FA enabled/disabled, device revoked, profile saved, signed out) layered on top of existing
  inline form errors, not replacing them.
- Password visibility toggle and a live strength meter on registration; skeleton loading
  states replacing bare "Loading…" text on the dashboard, security, and profile pages.
- Landing page visual pass: sticky nav with backdrop blur and a mobile menu, a logo mark, an
  illustrative (clearly decorative, not real-data) hero chart, scroll-anchored sections.
- `app/icon.svg`, a generated OG image (`next/og`), full `metadataBase`/Open Graph/Twitter
  card metadata, custom `not-found.tsx` and `error.tsx`.

### Caught by actually running it, not just building it

A full Playwright pass against the production build (register → dashboard → every nav
section → mobile viewport → theme toggle → logout, screenshotted at each step) found a real
bug that unit tests, `tsc`, and `next build` all missed: the mobile navigation drawer
collapsed to the header's own height (~56px) instead of the viewport, because Topbar's
`backdrop-blur` (a CSS `backdrop-filter`) makes it a containing block for `position: fixed`
descendants per spec — so the drawer's `inset-0` resolved against the 56px-tall header, not
the viewport. Fixed by portaling the drawer to `document.body` via `createPortal`
(`components/app-shell/mobile-nav.tsx`), which sidesteps the ancestor entirely instead of
special-casing it. A second, smaller issue (logout landing on `/login` instead of `/`, a race
between the app shell's auth guard and the logout handler's own navigation) was fixed by using
a hard `window.location` navigation on logout rather than a client-side route push — also the
more defensible choice for a session boundary, since it guarantees no in-memory client state
survives a logout rather than trusting every consumer to reset itself.

Both fixes were re-verified with the same Playwright script before this pass was considered
done: 9-step flow, zero console errors, screenshots reviewed at every step.

### Verified

- [x] `npm run test` (API) — 33/33 passing.
- [x] `npm run test:e2e` (API, live Postgres + Redis) — 9/9 passing.
- [x] `npm run lint` (`tsc --noEmit`) clean for both apps.
- [x] `npm run build` clean for both apps.
- [x] Full-stack Playwright run against the production build: register → dashboard → security
      (real 2FA panel + live device list) → profile (real form) → wallet (module preview) →
      mobile viewport + drawer nav → theme toggle → logout → landed back on `/` signed out.
      Zero console errors on the final run.

---

## MVP1 — Auth + User + Dashboard (initial delivery)

**Date:** 2026-08-13

### Added

- Full architecture documentation set (`docs/01`–`09`): PRD, system, database, API, security,
  blockchain, AI signal, UI/UX architecture, and roadmap with per-milestone acceptance criteria.
- Monorepo scaffold: npm workspaces, `apps/api` (NestJS), `apps/web` (Next.js 14),
  `infra/compose` (docker-compose for Postgres + Redis), `infra/docker` (production
  Dockerfiles).
- Full Prisma schema covering MVP1–MVP9 tables (users through fee schedules) — see
  `docs/03-database-architecture.md`. MVP1 tables are live; later tables are stable and ready
  for their milestone's services.
- **Auth module:** registration, login, argon2id password hashing, JWT access tokens +
  rotating opaque refresh tokens (replay-detected — a reused revoked token revokes every
  session for that user), TOTP 2FA enrollment/confirmation/disable with hashed single-use
  backup codes, email verification token flow, step-up-auth scaffolding for MVP3.
- **Users module:** profile CRUD, device listing/revocation.
- **Platform infra:** global JWT auth guard (opt-out via `@Public()`), RBAC role guard, rate
  limiting (`@nestjs/throttler`), append-only audit log writer used by every mutating action,
  notification port with a console-log development adapter, envelope encryption for
  at-rest TOTP secrets, boot-time `PlatformModeGuard` that refuses `PLATFORM_MODE=live`
  without a compliance attestation and a non-dev wallet signing provider, Swagger/OpenAPI at
  `/api/docs`.
- **Web app:** landing page (product explanation, custody/trust section, markets, AI signal
  preview, subscription tiers, how-it-works — no dark patterns, sandbox badge always visible
  outside `PLATFORM_MODE=live`), register/login pages with full 2FA challenge flow, protected
  dashboard shell matching the widget layout in `docs/08-ui-ux-architecture.md §4` with honest
  "ships in MVP-N" empty states for every module not yet built, and a working Security Center
  panel for 2FA enrollment.
- 29 unit tests (password hashing, TOTP, envelope encryption, duration parsing, and the full
  `AuthService` — registration, login, 2FA enrollment/verification, refresh rotation, replay
  detection) — all passing.

### Verified before merge (per `docs/01-PRD.md §34` gate)

- [x] `npm run build` succeeds for both `apps/api` and `apps/web`.
- [x] `npm run test` — 29/29 passing.
- [x] `npm run lint` (`tsc --noEmit`) clean for both apps.
- [x] `prisma migrate dev` applied cleanly against a real PostgreSQL 16 instance; a full smoke
      test was run against the live API: register → `GET /users/me` → refresh-token rotation →
      **replay of an already-rotated refresh token was correctly rejected and revoked every
      session for the user** → 2FA enrollment → 2FA confirmation with a real generated TOTP
      code → re-login correctly demanded 2FA → 2FA-gated login succeeded with a fresh TOTP
      code. `audit_logs` was inspected directly and contains a correctly ordered, correctly
      attributed row for every one of those events.
- [x] No secrets committed; `.env` is git-ignored, `.env.example` documents shape only.

### Known, documented simplifications (not hidden — see the referenced doc for the plan)

- Refresh token is kept in `localStorage` on the client rather than an httpOnly cookie — flagged
  in `apps/web/lib/session.ts` and tracked for `docs/09-roadmap.md §MVP10`.
- Email "sending" uses a console-log adapter (`NotificationPort` → `ConsoleNotificationAdapter`)
  — the interface is production-shaped, a real provider (Resend/SES) is a config change away.
- `packages/contracts` (shared generated types) is designed in `docs/04-api-architecture.md §2`
  but not yet populated — MVP1's handful of types are hand-mirrored in `apps/web/lib/types.ts`
  with a comment pointing at the intended end state.

### Not in this delivery

MVP2 (Wallet + Ledger + Deposit) through MVP10 (Production Hardening) — fully designed in
`docs/09-roadmap.md`, not yet implemented. No wallet, ledger, trading, P2P, signal, AI, or
admin code exists yet; the dashboard says so in the product itself rather than faking it.
