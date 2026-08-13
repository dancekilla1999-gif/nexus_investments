# Nexus Investments

Institutional-grade crypto investing & trading platform — monorepo (Next.js + NestJS +
PostgreSQL). Built as a modular monolith cut along real service boundaries, with a
double-entry ledger, multi-chain custody design, and an explainable AI signal engine — not a
themed frontend over someone else's exchange.

> **Status:** Architecture complete. **MVP1 (Auth + User + Dashboard) is implemented, tested,
> and has been run end-to-end against a real PostgreSQL database.** MVP2–MVP10 are fully
> designed in `docs/` and not yet coded — see `docs/09-roadmap.md` for what's next and how to
> pick it up.
>
> This platform moves **no real money in this repository's current state.** Everything runs
> in `PLATFORM_MODE=sandbox` by default; see `docs/01-PRD.md §8` and
> `docs/05-security-architecture.md §7` for what has to happen before that changes.

## Start here

Read in this order:

1. [`docs/01-PRD.md`](docs/01-PRD.md) — product requirements, scope, non-goals
2. [`docs/02-system-architecture.md`](docs/02-system-architecture.md) — services, tech stack
3. [`docs/03-database-architecture.md`](docs/03-database-architecture.md) — the ledger, schema
4. [`docs/04-api-architecture.md`](docs/04-api-architecture.md) — REST/WebSocket/webhook contracts
5. [`docs/05-security-architecture.md`](docs/05-security-architecture.md) — authN/authZ, key mgmt, compliance
6. [`docs/06-blockchain-architecture.md`](docs/06-blockchain-architecture.md) — multi-chain wallet & custody
7. [`docs/07-ai-signal-architecture.md`](docs/07-ai-signal-architecture.md) — indicators, signals, AI assistant
8. [`docs/08-ui-ux-architecture.md`](docs/08-ui-ux-architecture.md) — design system, screen inventory
9. [`docs/09-roadmap.md`](docs/09-roadmap.md) — milestones, acceptance criteria, **current status**

## Repository layout

```
apps/
  api/     NestJS modular monolith — see apps/api/src for the module list
  web/     Next.js 14 (App Router) customer-facing app
packages/  (reserved) shared contracts/config — see docs/02 §1; not populated until
           MVP2+ needs cross-module shared types beyond what apps/web/lib/types.ts covers today
infra/
  compose/ docker-compose for local Postgres + Redis
  docker/  Dockerfiles for apps/api and apps/web
docs/      the 9 architecture documents above
```

## Quickstart (local development)

Requires Node.js 20+, Docker, npm.

```bash
git clone <this repo>
cd nexus-investments
cp .env.example .env                 # edit if needed — sandbox defaults work as-is
cp apps/web/.env.example apps/web/.env.local

docker compose -f infra/compose/docker-compose.yml up -d   # Postgres + Redis

npm install
npm run prisma:migrate               # applies apps/api/prisma/migrations, generates client
npm run prisma:seed                  # seeds chains/assets/subscription plans reference data

npm run dev:api                      # http://localhost:4000 — Swagger at /api/docs
npm run dev:web                      # http://localhost:3000
```

## Testing

```bash
npm run test         # apps/api unit tests (29 tests: password hashing, TOTP, envelope
                      # encryption, duration parsing, and the full AuthService — registration,
                      # login, 2FA enrollment/verification, refresh rotation, replay detection)
npm run lint          # tsc --noEmit for both apps
npm run build          # production build for both apps
```

MVP1's auth flow was additionally verified **live** against a real PostgreSQL 16 instance
during development of this milestone: register → `/users/me` → refresh-token rotation →
replay-attack detection (a reused, already-rotated refresh token correctly revokes every
session for that user) → TOTP 2FA enrollment → 2FA-gated re-login. See `CHANGELOG.md`.

## Security

Do not open a public issue for a suspected vulnerability. See
`docs/05-security-architecture.md` for the security model and control list. This repository
ships no production secrets; `.env.example` documents required configuration with placeholder
values only.

## What "no fake fintech" means in this codebase

- `PLATFORM_MODE=live` will not boot without a signed compliance attestation file and a
  non-development wallet signing provider — see `apps/api/src/config/platform-mode.guard.ts`.
- Every dashboard widget whose backing module isn't built yet says so explicitly (which
  milestone ships it), instead of showing a plausible-looking fake number.
- The notification "adapter" wired up in MVP1 logs to the console and says so — it does not
  pretend to have sent an email.
- Signals (once MVP6 ships) will never claim to be "guaranteed" or "100% accurate" — see
  `docs/07-ai-signal-architecture.md §10`.

## License

Proprietary — all rights reserved. Not licensed for redistribution.
