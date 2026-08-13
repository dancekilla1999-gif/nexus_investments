# System Architecture

## 1. Style

Modular monorepo today, service-per-module tomorrow. Every bounded context in the PRD is a
**NestJS module with its own module boundary, its own Prisma-scoped repository layer, and its
own queue namespace** — so it can be extracted into its own deployable service by moving a
folder and standing up its own process, without touching its public contract. We do not start
with a distributed system we can't yet operate; we start with a monolith that is *already cut*
along the seams a distributed system would need.

```
apps/
  web/            Next.js 14 (App Router) — customer-facing app
  api/            NestJS — modular monolith, see module list below
packages/
  contracts/      Shared TypeScript types/DTOs/zod schemas used by web + api (generated
                  from the API's OpenAPI + Prisma schema — single source of truth)
  config/         Shared eslint/tsconfig/tailwind presets
docs/             This architecture set
infra/
  docker/         Dockerfiles per app
  compose/        docker-compose for local dev and staging-like environments
```

## 2. Request flow (high level)

```
                     ┌────────────────────┐
 Browser / Mobile ──▶│   Next.js (apps/web) │──▶ SSR/CSR, calls API over HTTPS + WSS
                     └────────────────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │  API Gateway layer │  NestJS: authN, rate limit, request
                     │  (NestJS apps/api) │  validation, RBAC, idempotency keys
                     └─────────┬──────────┘
          ┌─────────┬──────────┼──────────┬─────────────┬───────────┐
          ▼         ▼          ▼          ▼             ▼           ▼
      Auth Svc  User Svc   Wallet Svc  Trading Svc   Signal Svc  Admin Svc
          │         │          │          │             │           │
          └─────────┴────┬─────┴────┬─────┴──────┬──────┴───────────┘
                          ▼          ▼            ▼
                    PostgreSQL   Redis        BullMQ/Kafka
                   (system of    (cache,      (async jobs: chain
                    record)      sessions,     scanning, signal
                                 rate limit)    generation, notifs)
```

## 3. Module inventory (maps 1:1 to PRD bounded contexts)

| Module | Responsibility | Talks to chain? | Milestone |
|---|---|---|---|
| `auth` | Registration, login, JWT/session, 2FA (TOTP), device mgmt | no | MVP1 |
| `users` | Profile, preferences, RBAC roles | no | MVP1 |
| `kyc` | Identity verification case management, provider abstraction | no | MVP3 |
| `aml` | Transaction monitoring, sanctions screening | no | MVP3/9 |
| `wallet` | Deposit address issuance, withdrawal orchestration, balance sync | yes (via `blockchain`) | MVP2 |
| `blockchain` | Chain adapters (see `06-blockchain-architecture.md`), abstraction layer | yes | MVP2 |
| `ledger` | Double-entry ledger, balance types, immutable audit trail | no | MVP2 |
| `trading` | Order management, matching/execution, positions | no | MVP4 |
| `market-data` | Price/candle/order-book ingestion & normalization | no (external feeds) | MVP4 |
| `p2p` | Ads, escrow, order lifecycle, disputes | no (settles via `ledger`) | MVP5 |
| `signals` | Indicator engine, signal generation, performance stats | no | MVP6 |
| `ai` | AI assistant, explanation generation, grounded RAG over platform data | no | MVP7 |
| `news` | News aggregation, sentiment tagging | no | MVP7 |
| `macro` | Macro calendar, economic events | no | MVP7 |
| `onchain` | Whale/flow/TVL analytics (3rd-party API abstraction) | read-only | MVP7 |
| `subscriptions` | Plan tiers, entitlements, billing | no | MVP8 |
| `payments` | Fee engine, invoicing | no | MVP8 |
| `notifications` | Push/email/in-app/Telegram fan-out | no | MVP1 (infra) → MVP3+ (events) |
| `referrals` | Multi-level referral tracking, commission ledger | no | MVP8 |
| `risk` | Withdrawal risk engine, anomaly detection, scoring | no | MVP3/9 |
| `admin` | Ops console APIs backing the Admin Panel | no | MVP9 |
| `audit` | Immutable audit log writer/reader, used by every module | no | MVP1 (infra) |

Each module owns its own Prisma models (namespaced by table prefix, see
`03-database-architecture.md`) and exposes only DTOs across module boundaries — no module
reaches into another module's repository directly, it calls the other module's service class
(enforced by NestJS module encapsulation + an eslint boundary rule in `packages/config`).

## 4. Environments

| Env | Purpose | Money movement |
|---|---|---|
| `development` | Local dev, docker-compose Postgres/Redis, testnet chains | none real |
| `staging` | Shared pre-prod, testnet/sandbox chain RPCs, sandbox KYC/payment providers | none real |
| `production` | Live | real, gated by `05-security-architecture.md` + legal sign-off per `01-PRD.md §8` |

Enforced via `NODE_ENV` + a `PLATFORM_MODE` flag (`sandbox` \| `live`) read by the wallet and
trading modules; `sandbox` mode is visually stamped across the UI (banner + badge) — see
`08-ui-ux-architecture.md §Trust signals`. `PLATFORM_MODE=live` is refused to start unless a
signed compliance-review attestation file is present (`config/compliance/attestation.json`,
checked at boot by `apps/api/src/config/platform-mode.guard.ts`), so "flip an env var" cannot
silently light up real money movement.

## 5. Technology stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, TanStack Query,
  Zustand (light client state), Recharts/lightweight-charts for charting (TradingView-style
  candlesticks without redistributing TradingView's proprietary library).
- **Backend:** Node.js 22, NestJS 10, TypeScript, class-validator/zod DTOs.
- **Database:** PostgreSQL 16, Prisma ORM (typed schema, migrations).
- **Cache/session/rate-limit:** Redis 7.
- **Queues:** BullMQ (Redis-backed) for MVP1–MVP6 job volume; documented upgrade path to Kafka
  when cross-service event fan-out (multiple consumers, replay, > single-node throughput)
  actually requires it — see `09-roadmap.md §MVP10`.
- **Realtime:** WebSocket gateway in NestJS (`@nestjs/websockets`), Redis pub/sub adapter for
  horizontal scale.
- **Blockchain SDKs:** viem (EVM chains), `@solana/web3.js`, `tronweb`, `bitcoinjs-lib` +
  descriptor-based PSBT signing for Bitcoin. See `06-blockchain-architecture.md`.
- **Infra:** Docker, docker-compose (dev), designed for ECS/GKE or plain Docker+Nomad in
  prod (cloud-agnostic — no proprietary managed services required to run it).
- **Observability:** Sentry (errors), Prometheus (metrics) + Grafana (dashboards), pino
  structured logs shipped to whatever log sink the deploy target provides.
- **AuthN:** first-party — argon2id password hashing, JWT access tokens (short-lived) +
  opaque rotating refresh tokens (Redis-backed, revocable), TOTP 2FA. OAuth2 login
  (Google/Apple) is an additive provider behind the same session issuance path, not a
  replacement for it.

## 6. Why not microservices on day one

A crypto custody platform's hardest problems (ledger correctness, withdrawal safety,
KYC/AML) are **consistency problems**, not **throughput problems**, in the first 12 months of
any real launch. A modular monolith with strict module boundaries and Postgres transactions
gives us strong consistency for free; a distributed system trades that consistency for
horizontal scale we don't need yet and pays for it in operational complexity we can't yet
staff for. The module boundaries above are drawn so that when a *specific* module (most
likely `market-data`, `signals`, or `blockchain` chain-watchers under load) genuinely needs
its own scaling envelope, it is extracted — not rewritten.

## 7. Multi-service extraction path (future)

1. `blockchain` (chain watchers are I/O-bound, benefit from independent scaling per chain)
2. `market-data` (high-frequency ingestion, independent of request/response latency budget)
3. `signals` + `ai` (CPU/GPU-bound batch and inference work)
4. Everything else stays in the modular monolith until proven otherwise.
