# Changelog

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
