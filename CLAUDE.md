# CLAUDE.md — working rules for this repository

Read this before writing code. It exists so a long session does not lose the reasoning behind
decisions that are expensive to reverse.

---

## 0. What this platform is

A hybrid financial platform with **four** product surfaces over one ledger, one risk engine and
one identity system:

| Surface | Custody | Who decides the trade |
|---|---|---|
| **Spot trading** (crypto, later equities) | Custodial *or* self-custody wallet | The user |
| **P2P marketplace** | Custodial escrow | The two counterparties |
| **Investment management** | Custodial pooled (`STRATEGY_POOL`) | The strategy manager |
| **Fiat gateway** | Custodial | n/a |

Two client shells over one Next.js app: a **website** and a **Telegram Mini App**.

Documents are the source of truth for design, `docs/09-roadmap.md` for status. If code and a
doc disagree, one of them is a bug — decide which and fix it, do not leave the contradiction.

---

## 1. Three contradictions between the specs, and how they are resolved

These are recorded because a future session *will* rediscover them and be tempted to "fix" one
side.

### 1.1 Non-custodial seed phrase vs. managed investment pools

The hybrid-exchange addendum requires client-side BIP-39 key generation where the server can
never decrypt a user's key. The investment-management addendum requires a manager to trade
pooled investor capital. **These cannot both be true of the same balance** — a manager cannot
trade assets the platform is structurally unable to sign for.

**Resolution: custody is a property of the account, not of the platform.**

```
User
├── Self-custody wallet   keys generated and encrypted client-side; server holds only an
│                         opaque blob it cannot decrypt. Spot, P2P, withdrawals.
└── Custodial accounts    platform-controlled custody. The only place investment strategies,
                          escrow and pooled trading can operate.
```

Moving value from self-custody into a custodial account is an explicit, signed, disclosed act by
the user — never implicit, and the UI states plainly which mode a balance is in. A platform that
blurs this is telling users they hold their keys while trading their money.

### 1.2 Own matching engine vs. liquidity aggregation

`docs/13` states the platform runs **no** internal order book and routes to external venues.
The hybrid-exchange addendum requires a FIFO matching engine with an in-memory book.

**Resolution: both, per market.** A `Market` declares its `executionMode`:

- `INTERNAL_BOOK` — matched by our own engine (FIFO, price-time priority).
- `ROUTED` — passed to the Smart Order Router and filled on external venues.
- `HYBRID` — internal book first, remainder routed.

This is what "hybrid exchange" actually means, and it keeps `docs/13`'s reconciliation
discipline: every externally-sourced fill still reconciles against the ledger.

### 1.3 The 50/50 profit share applies to investment products only

Spot and P2P carry their own disclosed trading fees. The 50% performance fee is a property of an
`InvestmentStrategy`, never a platform-wide charge.

---

## 2. Non-negotiable rules

Violating any of these is a defect regardless of what a ticket says.

### Money

1. **The ledger is the only write path for value.** No service sets a balance directly. There is
   no `ADMIN_TRANSFER` and no endpoint that takes an amount and a destination from an operator.
2. **A balance never goes negative.** Enforced by CHECK constraint, not only by code.
3. **Every posting balances to zero per asset**, enforced by a deferred constraint trigger.
4. **Money is `Decimal(36,18)`. Never a float, never a JS `number`, ever.** Amounts cross the
   API as strings. Quantise once, downward, before writing — see §4.3.
5. **Ownership is a property of the account.** The ledger must always answer "whose money is
   this?" — `docs/12` §1.
6. **Investor-owned value may not reach a platform account** except through the named fee types,
   blocked at the database level for everything else.
7. **Idempotency on every financial mutation.** Retries are safe by construction.

### Concurrency

8. **Check-and-spend is one indivisible step.** `SELECT … FOR UPDATE` inside the transaction, in
   deterministic lock order. Never read a balance, decide, then write.
9. **Never use ORM `{ increment }` on a Decimal column** — it does not preserve precision. Read
   under lock, compute in Decimal, write.
10. **Decimal.js keeps 20 significant digits by default, and that has caused three separate bugs
    here.** Any money arithmetic that accumulates over many terms, or multiplies before dividing,
    must use an explicit high-precision constructor (`Prisma.Decimal.clone({ precision: 60 })`).
    The default silently truncates an intermediate and the result looks plausible.
11. **A split must sum to the whole.** Use `apportion` (largest-remainder), never per-share
    rounding — parts that do not add up mean value shown to nobody or to two people at once.

### Keys and secrets

12. **No private key or seed phrase in the database in a form the server can decrypt.** Ever,
    under any configuration.
13. **No secret in a log line.** The security logger has an explicit deny-list.
14. **Signing lives behind `SigningProvider`** (HSM/MPC in production). The API process holds no
    signing capability of its own.

### Honesty

15. **Never fabricate data.** A missing value renders as "not available", never as zero. A chart
    of zeros is a fabricated track record.
16. **Never claim a guaranteed outcome.** Enforced by the forbidden-claims gate, in English and
    Russian, over all user-facing copy.
17. **If a feature cannot work safely with real money yet, label it sandbox/testnet** and make
    the API refuse it in live mode. Do not create the appearance of a real financial operation.
18. **Append-only history.** Ledger entries, audit logs, NAV snapshots, fee accruals and consent
    records reject UPDATE and DELETE by trigger. Corrections are new rows.

---

## 3. Commands

```bash
# Infrastructure (PostgreSQL + Redis must be running)
pg_isready && redis-cli ping

# Type-check (this is what `lint` runs)
npm run lint -w apps/api
npm run lint -w apps/web

# Unit + integration tests, including live-RPC tests against Sepolia
cd apps/api && npx jest --runInBand
SKIP_LIVE_RPC_TESTS=1 npx jest --runInBand      # opt out of network tests

# End-to-end tests against real PostgreSQL + Redis
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand

# One suite
npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern investment-dealing

# Migrations — never `migrate dev` (it prompts). Generate the SQL, review it, then deploy.
cd apps/api
psql "$SHADOW_URL" -c "DROP DATABASE IF EXISTS nexus_investments_shadow" -c "CREATE DATABASE nexus_investments_shadow"
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_URL" --script > prisma/migrations/<ts>_<name>/migration.sql
npx prisma migrate deploy
DATABASE_URL="…nexus_investments_test…" npx prisma migrate deploy   # test DB too
npx prisma generate

# Production builds
npm run build -w apps/api && npm run build -w apps/web
```

**PostgreSQL will not let a newly added enum value be used in the transaction that adds it**, and
Prisma runs each migration file in its own transaction. Adding an enum value and using it in a
constraint therefore needs **two** migration files.

---

## 4. How to write code here

### 4.1 Test against real infrastructure, not mocks

Every bug that mattered in this repository was found by a test against a real PostgreSQL, a real
Redis, a live Sepolia node, or a real headless browser — and missed by type-checking and unit
tests. A mock asserts that the code calls the functions the code calls.

When the claim is "the database refuses", the test must **bypass the service layer and write raw
SQL**. Testing through the service tests the service.

### 4.2 Write the invariant test

`Σ position.units == strategy.totalUnits`, `custody == Σ obligations`, "the projection matches a
replay of every entry". These find the bugs that no example-based test does, because they fail on
the case nobody thought to write.

### 4.3 Rounding has a direction, and it is a decision

Round **down** when issuing a claim (units) and when paying one out. Rounding up issues more
claim than the money paid for, which dilutes every existing holder. A sub-wei residue left in the
pool harms nobody.

### 4.4 Comments explain *why*, and record what was already tried

A comment restating the code is noise. A comment recording that `\b` does not work with Cyrillic,
or that Prisma swallows errors raised during its own COMMIT, saves the next person a day.

### 4.5 Fail loudly rather than approximately

`valuePool` throws on an asset it cannot mark rather than valuing it at zero. A NAV that quietly
omits an asset is worse than no NAV.

### 4.6 Verify UI in a real browser

`npx playwright` against the production build, at 1440px and 390px. Check for console errors and
horizontal overflow. This has caught real bugs (a portal containing-block failure, a `<select>`
scrolling the page sideways, a legal warning split mid-sentence out of its own box).

---

## 5. Security posture

Detail in `docs/05-security-architecture.md` and `docs/16-hardening.md`. The short version:

- Sessions: argon2id passwords, rotating refresh tokens with replay detection, TOTP for critical
  actions. **Telegram `initData` is validated by HMAC-SHA256 against the bot token on every
  login** — an unsigned or stale payload is 401, never a warning.
- **Access tokens live in memory only.** Never `localStorage`, never `sessionStorage`. Refresh
  tokens are `HttpOnly; Secure; SameSite=Strict` cookies.
- Rate limiting is Redis-backed and atomic (Lua), per user ID and per IP, not per process.
- Every DTO is validated server-side (`class-validator`/`zod`). No raw SQL outside reviewed
  migrations and explicitly-parameterised locking queries.
- CORS allow-lists exact origins. `HSTS`, `X-Frame-Options`, `nosniff`, and a CSP that permits
  the Telegram frame ancestor and nothing else.
- The security logger records IP changes, repeated 2FA failures and anomalous volume — and is
  physically incapable of logging a key, seed or password.

---

## 6. Repository layout

See `docs/15-hybrid-exchange-addendum.md` §2 for the full tree and what each service owns.

---

## 7. Before you say something is done

- `npm run lint` clean in both apps.
- Unit **and** e2e suites green, run against live PostgreSQL and Redis.
- Migrations applied to both the dev and the test database.
- UI checked in a browser at desktop and mobile widths.
- `CHANGELOG.md` and `docs/09-roadmap.md` updated — including what you did **not** build and why.
- Report failures with their output. A skipped step is stated, not omitted.
