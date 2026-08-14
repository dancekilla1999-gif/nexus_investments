# Changelog

## MVP12 — Investment marketplace and the publication gates

**Date:** 2026-08-14

Investment products, and the two gates that decide whether one may take a single dollar. The
marketplace is the visible part; the gates are the point.

### The backtest gate

A strategy cannot reach `OPEN` without a `BacktestResult` — and "passing" is not self-reported.
The measured max drawdown must be within the ceiling the strategy itself advertises: a product
promising a 10% limit cannot be justified by a run that lost 30%. Both the dedicated route and
the generic status setter enforce it, because two doors to the same room both need locking. On
success the audit row records the measured and configured drawdown together, so the decision can
be re-examined later without re-running anything.

### The forbidden-claims gate

A promise of guaranteed return is not a copywriting slip; it is the single sentence most likely
to turn a marketing page into a mis-selling case, and a reviewer's attention is not a control.
Copy is scanned at creation *and* again at publication — copy can be edited in between, and
publication is the last moment before real money is exposed to it. Rejections name the field and
the matched text so the author can fix it rather than guess.

**Two bugs found while building this gate, both of which would have made it worse than useless:**

1. **The Russian rules matched nothing.** `\b` in JavaScript is defined over `[A-Za-z0-9_]`, so
   every Cyrillic letter counts as a non-word character and the word boundaries landed in the
   wrong places. The gate looked complete and silently passed `Гарантированная прибыль`. Now
   `\p{L}` with the `u` flag. The platform's operator writes in Russian — a rule that only
   catches English is a rule a translator walks straight through.
2. **The rules would have blocked the required disclaimer.** "Past results do not guarantee
   future returns" and "прошлые результаты не гарантируют будущих" are the sentences regulators
   expect to see, and the naive pattern flagged them as claims — forcing authors to delete their
   own risk warning. Negation is now evaluated in a window around the match, not as a lookbehind,
   because it is not always adjacent ("Nothing here guarantees a result"). A bare "no" is
   deliberately *not* a negation marker, so "No fees, guaranteed profit" is still caught.

### No fabricated track record

AUM, NAV per unit and performance are `null` until the NAV engine has struck a snapshot, and the
UI says "there is none yet" and explains that the backtest was a simulation. Zero-filling them
would have rendered a chart of zeros, which is a fabricated track record with extra steps.

### Terms before the amount field

Minimum, lock-up, redemption notice, dealing frequency, drawdown limit and both fee rates come
from the API and are shown before anything asks for a number. The frontend hardcodes no rate.

Under the 50% profit share the fee and the drawdown cap are displayed *together*, with the split
stated from the investor's side — "you keep 50%, the manager takes 50%" — plus a worked example
(a 20% gross year leaves roughly 10%). The two numbers only make sense read as a pair: the
manager shares the upside and not the downside, and the cap is what bounds that.

Economic terms freeze once an investor holds the strategy; descriptive copy stays editable.
Changing fees under someone who already subscribed is a different act from configuring a draft.

`SEGREGATED_COPY` custody is refused at creation rather than producing a strategy whose
accounting silently does not exist.

### Operator roles

`INVESTMENT_MANAGER`, `TRADER`, `FINANCE` and `ANALYST` join the role enum (docs/12 §8). The
admin namespace has no endpoint that moves value, and the ledger's ownership boundary means one
could not be added by accident.

### Also fixed

`MarkdownLite` rendered every hard-wrapped source line as its own block, which split the risk
disclosure's warning callout mid-sentence and dropped the rest of it out of the warning box into
plain body text. On a risk disclosure, a warning that visually ends halfway through its own
sentence is not a cosmetic problem. Lines now join into blocks, with lazy continuation so a
wrapped callout stays inside its box.

### Verification

35 unit tests on the claims gate — half of them asserting that honest descriptions and required
disclaimers pass, because a gate that blocks legitimate copy gets routed around or switched off.
25 e2e tests driving every gate through the API. 217 tests total (99 unit/integration including
live Sepolia, 118 e2e against live PostgreSQL and Redis), plus headless-browser verification of
both investment pages at desktop and mobile widths.

---

## MVP11 — Investment accounting and the ownership boundary

**Date:** 2026-08-14

The first slice of the Investment Management addendum (`docs/12`). Deliberately not the
manager terminal, not the marketplace, not a single screen: the accounting that makes it
possible to say who owns what, and the constraint that stops anyone taking it. Building the
terminal first would mean trading money the books cannot yet correctly attribute.

### Ownership is a property of the account

Four new ledger account types — `PENDING_SUBSCRIPTION` (committed to a strategy but still the
user's, returned in full if cancelled before the dealing point), `STRATEGY_POOL` (owned by that
strategy's investors collectively, pro rata by units), `PLATFORM_TREASURY` and
`PLATFORM_REVENUE`. Plus the models the unit accounting needs: `InvestmentStrategy`,
`InvestmentPosition`, `NavSnapshot`, `SubscriptionRequest`, `FeeAccrual`.

`navPerUnit` is deliberately **not** a column on the strategy. It lives on the immutable NAV
snapshot, so there is no field for anyone to hand-edit.

### The boundary, in the database

> A ledger transaction may not place a user-owned or pool-owned account on one side and a
> platform-owned account on the other, unless its type is one of a short, named list whose
> amounts come from the fee engine or a venue report.

A deferred constraint trigger, not a service check — application code can be changed by anyone
who can merge a commit, while a migration is a visible, reviewable artefact that keeps holding
if the application layer is compromised or bypassed. Permitted: `FEE_CRYSTALLISATION`,
`TRADING_FEE`, `FEE`, `REFERRAL_COMMISSION`. Everything else, `ADJUSTMENT` and `TRADE`
included, is refused.

`TRADE` is barred on purpose. A fill is pool-internal — cash out, asset in — and the venue fee
is its own `TRADING_FEE` posting, atomic with the fill because both are written in one database
transaction. Had `TRADE` been allowed to touch a platform account, "a trade" would have been a
general-purpose way to move any amount of investor money to the platform.

### The 50/50 profit share

The operator's fee model is a pure profit share: `perfFeeBps = 5000`, `mgmtFeeBps = 0` — no
profit, no fee. Both stay per-strategy configuration, with a CHECK ceiling of 5000 so a typo
cannot turn a 50% share into a 500% one. Three consequences are recorded in `docs/12` §6.0, two
of which are code rather than commentary: net-of-fee return becomes the headline figure
everywhere performance is shown (a +20% gross strategy delivers +10%, and burying that in the
fine print is the kind of claim §3.1 forbids), and the hard 10% drawdown cap stops being a
prudent default and becomes load-bearing — at a 50% share the manager takes half the upside and
none of the downside, which rewards volatility, and the cap is the structural counterweight.

### What else the database now refuses

- `hwmUnitPrice` cannot decrease. Lowering a high water mark is indistinguishable from charging
  for the same performance twice — and at 50%, it takes half of a gain already paid for.
- NAV snapshots cannot be updated or deleted. A correction is a new snapshot.
- A fee accrual's rate, base, high water mark and amount are frozen at insert; only the
  crystallisation stamp may change, and only once. An investor can always reconstruct the
  arithmetic behind a charge.
- `maxDrawdownBps > 1000` and `perfFeeBps > 5000` rejected outright.
- A `STRATEGY_POOL` account cannot exist without a strategy; a user bucket cannot carry one; a
  strategy cannot have two pool accounts for the same asset (two rows would let reconciliation
  read one and miss the other).

### Verification, and a bug it caught

25 new e2e tests, every one writing **raw SQL with no service in the path** — the claim under
test is "the database refuses", so routing through the service layer would have tested the
wrong thing. The same pool→platform movement is attempted under eight transaction types and
refused each time, including when the platform leg is a 1-unit sliver hidden among legitimate
legs, then accepted under the fee types.

Those tests found a real bug in MVP2's work: `ledger_accounts_personal_unique` treated every
`managedAccountId IS NULL` row as somebody's personal balance. Pool accounts are held under the
platform system user, so the index **capped the platform at one strategy per asset** — the
second strategy to hold USDC was rejected outright. Narrowed in migration
`20260814200200_scope_personal_account_uniqueness`.

Totals: 157 automated tests (64 unit/integration including live Sepolia, 93 e2e against live
PostgreSQL and Redis).

### Not built yet

Everything that spends this foundation: subscription and redemption services, dealing points,
the NAV engine, fee accrual and crystallisation, the marketplace, the manager terminal. MVP12
onward in `docs/09-roadmap.md`.

---

## MVP2 (part 2) — On-chain deposits and custody reconciliation

**Date:** 2026-08-14

This completes MVP2. Part 1 built the ledger and proved it internally consistent; this part
connects it to real chains and — more importantly — adds the check that the ledger's numbers are
actually *backed*.

### Deposits, end to end

Watch-only HD derivation gives each user a stable address per chain, derived from an account
extended **public** key. No private key or seed appears in configuration anywhere, so the API
process is structurally incapable of signing. Address issuance reads the chain's derivation
counter under a row lock: two concurrent requests reading the same index would hand two users
the *same* deposit address and make their funds indistinguishable on chain.

A watcher scans each configured chain for incoming native and ERC-20 transfers. Detection
credits the user's PENDING bucket immediately — an invisible deposit generates a support ticket
every single time — and PENDING moves to AVAILABLE only at the chain's required confirmation
depth, so a reorg cannot claw back money someone has already spent.

Correctness deliberately does not depend on the watcher being careful. Deposits are idempotent
on `(chainId, txHash, logIndex)` at the database level, so overlapping scan windows, restarts
mid-range and reorg rewinds are all harmless. That inverts the usual difficulty: the watcher is
allowed to be crude because nothing it does can double-credit anyone.

### Custody reconciliation

A double-entry ledger guarantees the books are internally consistent. It cannot guarantee that
the assets behind them exist — a ledger can be perfectly balanced and completely wrong about
reality. `CustodyReconciliationService` compares, per (chain, asset), what the EXTERNAL boundary
account says the platform owes against the summed on-chain balance of every deposit address it
controls. A shortfall files a severity-5 `RECONCILIATION_MISMATCH`; a surplus files severity 1,
because funds held but uncredited are, from the user's side, money that has gone missing. A
persistent mismatch stays one open incident with refreshed numbers rather than one per scan.

### Bugs this found before they could cost anyone money

Each was caught by testing against real infrastructure — a live Sepolia node, a real PostgreSQL,
a real browser. None would have been caught by type-checking or by mocks.

1. **Compressed-key derivation produced valid-looking but wrong addresses.** `publicKeyToAddress`
   given a compressed secp256k1 key returns a well-formed, checksummed address that is *not* the
   one the corresponding private key controls. Every deposit address the platform issued would
   have been unspendable — funds arriving at an address nobody holds a key for. Keys are now
   decompressed before hashing, with a regression test pinned to a published BIP-32 test vector.

2. **The sandbox faucet was booking play money as real custody.** Faucet mints debited
   `EXTERNAL`, the same contra-account that means "this really arrived on chain." Running
   reconciliation against live Sepolia reported a **3000 ETH shortfall** on a perfectly healthy
   sandbox. An alarm that always fires is an alarm nobody reads — and this is the one alarm that
   would catch the platform being unable to pay its users. Faucet mints now debit a separate
   `SANDBOX_MINT` contra-account, so synthetic value is structurally incapable of being mistaken
   for custody.

3. **A token with no contract address was reconciled against the native balance.**
   `getBalance(address, null)` reads native, so a `TOKEN` row without a contract address had the
   chain's ETH holdings reported under that token's symbol — a phantom mismatch loud enough to
   bury a real one. Worse, the deposit screen listed that same token as supported, inviting users
   to send funds the scanner cannot see and the platform will never credit. One shared rule
   (`src/deposits/creditable-assets.ts`) now backs the watcher, the deposit UI and reconciliation
   so the three cannot drift.

4. **A `<select>` sized by its longest option scrolled the whole wallet page sideways on a
   phone.** Pre-existing; found by measuring `scrollWidth` in a real headless browser at 390px.

### Deposit UI

Per-chain address with copy-to-clipboard, and two things this screen has to get right because
getting them wrong costs a user their money. The chain is stated on the address, in the warning,
and next to the copy button — sending on the wrong network loses funds permanently. And a
pending deposit shows confirmation progress with an explicit "not yet spendable", rather than
sitting silently beside a balance card that implies otherwise. Only assets the deployment can
actually credit are listed; if there are none, the screen says so in red rather than staying
silent, since silence reads as "anything works".

### Verification

- 64 unit/integration tests, including nine against a live Sepolia node.
- 68 e2e tests against live PostgreSQL and Redis, 26 covering the deposit pipeline: the
  concurrent-derivation race, double-credit on rescan, confirmation gating, token decimals,
  foreign addresses, unsupported tokens, cursor behaviour, cross-user isolation, and every
  reconciliation branch.
- Headless-browser verification of the wallet page at 1440px and 390px — address rendering,
  wrong-network warning, no horizontal overflow, no console errors.
- Reconciliation exercised end to end against live Sepolia through the risk-ops endpoint.

### Still explicitly not built

Withdrawals — they ship with the risk engine and AML screening that gate them (MVP3) — and
sweeping to cold custody. Until sweeping exists, reconciliation's custody side is the deposit
addresses; `docs/06` records what must change when it lands, so that a sweep does not read as
theft.

---

## MVP2 (part 1) — Double-entry ledger and wallet

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
