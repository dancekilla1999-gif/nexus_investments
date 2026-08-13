# Changelog

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
