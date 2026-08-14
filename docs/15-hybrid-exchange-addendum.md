# 15. Hybrid Exchange Addendum — matching engine, Telegram Mini App, self-custody

> **Status:** design. Extends the platform to a hybrid exchange (spot crypto + equities + P2P +
> fiat gateway) delivered as both a website and a Telegram Mini App. Nothing already built is
> discarded; this document records what is added and, where the new requirements conflict with
> earlier ones, which side wins and why.

## 0. Three conflicts, resolved

Recording these matters more than the new features: each is a place where following one spec
literally would silently break the other.

### 0.1 Self-custody keys vs. managed investment pools — **both, per account**

The addendum requires BIP-39 seed generation in the browser, AES-GCM encryption under a
PBKDF2-derived key, and a server that stores only an undecryptable blob. The investment module
requires a manager to trade pooled investor capital.

A manager cannot trade assets the platform is structurally unable to sign for. So custody becomes
a property of the **account**, not of the platform:

```
User
├── SELF_CUSTODY wallet    keys generated client-side, never leave the device in cleartext.
│                          Spot trading, P2P, withdrawals. The platform cannot move these funds.
└── CUSTODIAL accounts     platform-held custody (HSM/MPC). The only place investment strategies,
                           P2P escrow and pooled trading can operate.
```

Moving value between the two is an explicit, user-signed, disclosed act. Every balance in the UI
states which mode it is in. **A platform that blurs this is telling users they hold their keys
while it trades their money** — and it is the single most consequential thing on this page.

### 0.2 Own order book vs. liquidity aggregation — **both, per market**

`docs/13` states the platform runs no internal matching engine and routes to external venues. The
addendum requires a FIFO in-memory book. `Market.executionMode` decides:

| Mode | Behaviour |
|---|---|
| `INTERNAL_BOOK` | Matched by our engine — price-time priority, FIFO within a price level |
| `ROUTED` | Handed to the Smart Order Router, filled externally (`docs/13`) |
| `HYBRID` | Internal book first; unfilled remainder routed |

That is what "hybrid exchange" means literally, and `docs/13`'s reconciliation discipline still
applies to every externally-sourced fill.

### 0.3 Fees

The 50/50 profit share belongs to an `InvestmentStrategy`. Spot and P2P carry their own disclosed
maker/taker and service fees. Neither is hardcoded in the frontend.

---

## 1. What is added

| Module | Language | Responsibility |
|---|---|---|
| `matching-engine` | **Rust** | In-memory order book per market, FIFO price-time matching, deterministic replay from a durable command log |
| `backend/tma` | TypeScript | Telegram `initData` validation, bot OTP delivery, Mini App session issuance |
| `backend/p2p` | TypeScript | Ads, escrow, payment-window timers, dispute arbitration |
| `backend/fiat` | TypeScript | Fiat on/off-ramp provider abstraction |
| `backend/equities` | TypeScript | Broker adapter (Alpaca-shaped), market hours, corporate actions |
| `backend/security` | TypeScript | Security event log, anomaly rules, automatic withdrawal freeze |
| `frontend` shells | TypeScript | One Next.js app, two shells: web and TMA |

**Rust over Go** for the engine: a matching engine is a latency-critical, allocation-sensitive
loop where a GC pause is a visible fairness problem — two orders that arrived in one order can be
filled in another. Rust removes that class of jitter, and the engine is small and self-contained
enough that the borrow checker costs little here.

### 1.1 The engine owns no money

The matching engine matches. It does **not** hold balances, does not decide whether an order is
affordable, and cannot move value. Sequence:

```
Order intent → Backend: risk + LOCK funds in the ledger (atomically)
             → Engine:  match against the book, emit fills
             → Backend: settle fills through the ledger (LOCKED → counterparty)
```

If the engine crashes, no money is lost: reserved funds are locked in the ledger and the book is
rebuilt by replaying the command log. **An in-memory book must never be the record of who owns
what.**

---

## 2. Repository layout

```
nexus-investments/
├── CLAUDE.md                     working rules — read first
├── docker-compose.yml            postgres · redis · api · web · engine · nats
│
├── apps/
│   ├── api/                      NestJS — the money, the rules, the integrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/       raw SQL; triggers and CHECKs live here, not in the DSL
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts · configure-app.ts · app.module.ts
│   │   │   ├── common/           guards · decorators · filters · crypto · utils
│   │   │   ├── config/           env validation (zod) · platform-mode guard
│   │   │   ├── prisma/ redis/ logger/ audit/ notifications/ health/
│   │   │   │
│   │   │   ├── auth/             ✅ password · JWT rotation · TOTP · devices
│   │   │   ├── tma/              ➕ initData HMAC validation · bot OTP · TMA sessions
│   │   │   ├── users/            ✅ profile · RBAC
│   │   │   ├── legal/            ✅ risk disclosure · consent records
│   │   │   │
│   │   │   ├── ledger/           ✅ double-entry — the only write path for value
│   │   │   ├── wallet/           ✅ balances · internal transfers
│   │   │   ├── selfcustody/      ➕ encrypted key-blob backup · address registration
│   │   │   ├── blockchain/       ✅ chain adapters (viem) · HD derivation
│   │   │   ├── deposits/         ✅ watcher · crediting · custody reconciliation
│   │   │   ├── withdrawals/      ⏳ risk → AML → approval → SigningProvider
│   │   │   ├── fiat/             ➕ on/off-ramp provider abstraction
│   │   │   │
│   │   │   ├── markets/          ⏳ instruments · execution mode · trading hours
│   │   │   ├── marketdata/       ⏳ tickers · candles · order-book snapshots
│   │   │   ├── trading/          ⏳ order lifecycle · fund locking · fill settlement
│   │   │   ├── execution/        ⏳ Smart Order Router · venue adapters
│   │   │   ├── equities/         ➕ broker adapter · corporate actions
│   │   │   ├── p2p/              ➕ ads · escrow · timers · disputes
│   │   │   │
│   │   │   ├── investments/      ✅ strategies · subscriptions · dealing points · units
│   │   │   ├── nav/              ⏳ valuation engine · immutable snapshots
│   │   │   ├── fees/             ⏳ accrual · high water mark · crystallisation
│   │   │   ├── allocation/       ⏳ derived exposure · flow netting
│   │   │   ├── manager/          ⏳ manager terminal APIs
│   │   │   │
│   │   │   ├── risk/             ⏳ pre-trade pipeline · limits · circuit breakers
│   │   │   ├── security/         ➕ security event log · anomaly rules · auto-freeze
│   │   │   ├── kyc/ aml/         ⏳ provider abstractions · sanctions screening
│   │   │   └── admin/            ⏳ ops console APIs
│   │   └── test/                 e2e against live PostgreSQL + Redis
│   │
│   └── web/                      Next.js — one app, two shells
│       ├── app/
│       │   ├── (marketing)/      public site
│       │   ├── (app)/            authenticated: wallet · trading · p2p · investments · …
│       │   └── (tma)/            ➕ Telegram Mini App shell
│       ├── components/
│       │   ├── ui/ finance/ app-shell/ wallet/ legal/
│       │   ├── trading/          ➕ chart · order form · book · depth
│       │   ├── p2p/              ➕ ad list · deal room · dispute view
│       │   └── tma/              ➕ safe-area · theme sync · BackButton · MainButton
│       └── lib/                  api-client · auth-store · crypto (client-side keys)
│
├── services/
│   └── matching-engine/          ➕ Rust
│       ├── src/
│       │   ├── book.rs           price levels · FIFO queues
│       │   ├── engine.rs         match loop · deterministic sequencing
│       │   ├── command_log.rs    durable append-only log for replay
│       │   ├── snapshot.rs       periodic book snapshots to bound replay time
│       │   └── transport.rs      NATS/gRPC ingress · fill egress
│       └── tests/                property tests: FIFO fairness · conservation
│
├── packages/
│   ├── contracts/                ➕ OpenAPI-generated types shared by api and web
│   └── config/                   eslint · tsconfig · prettier
│
├── docs/                         01–16 (this file is 15)
└── infra/
    ├── docker/ · k8s/ · nginx/   TLS 1.3 · HSTS · CSP · security headers
    └── runbooks/                 incident · key ceremony · DR
```

`✅` built · `⏳` designed, not built · `➕` added by this addendum

---

## 3. Telegram Mini App

### 3.1 Authentication

`initData` is a signed payload from Telegram. Validating it correctly is the entire security of
TMA login:

1. Parse the query string; remove `hash`.
2. Sort remaining pairs by key, join as `k=v` separated by `\n` — the *data-check string*.
3. `secret = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)`.
4. Expected `hash = HMAC_SHA256(key=secret, message=data_check_string)`, hex.
5. Compare in **constant time**. A `===` here is a timing oracle.
6. Reject if `auth_date` is older than 60 seconds — a valid signature is not a fresh one, and
   replay is the obvious attack on a payload that lives in a URL.

Failure is `401`, always, with no detail about which check failed.

### 3.2 Tokens

- **Access token: in memory only.** Never `localStorage`, never `sessionStorage` — a Mini App
  runs inside a webview where persisted storage is the easiest thing to exfiltrate.
- **Refresh token: `HttpOnly; Secure; SameSite=Strict` cookie**, rotated on use, with replay
  detection already implemented for the web app.
- A TMA session is bound to the Telegram user id. A session that arrives with a different id is
  terminated, not migrated.

### 3.3 Shell

`@telegram-apps/sdk`: viewport-safe insets, theme parameters mapped onto the existing design
tokens (the app already supports light/dark), and the hardware Back button wired to the router so
it navigates rather than closing the app. `MainButton` drives the primary action of each screen.

---

## 4. Self-custody wallet

```
Registration (browser, Web Crypto API):
  entropy → BIP-39 mnemonic (12 words)          shown once, never transmitted
  PIN + salt → PBKDF2-SHA256, ≥ 100 000 iters → AES-GCM key
  AES-GCM(seed) → encrypted blob + iv + salt   → server stores this and nothing else
```

- The server never receives a mnemonic, a private key, or a PIN. It stores a blob it cannot
  decrypt, as a **backup convenience**, and says so in the UI.
- Iteration count and KDF parameters are stored **alongside** the blob, so they can be raised
  later without stranding old backups.
- Losing the PIN and the mnemonic means losing the funds. This is stated before the wallet is
  created, not after — a "recovery" flow that quietly implies the platform can help would be a
  lie.
- Signing happens client-side. The self-custody path has no `SigningProvider` on the server at
  all, which is the point.

---

## 5. P2P escrow

```
Ad → Order opened → seller's crypto LOCKED in the ledger, atomically
   → buyer marks fiat paid  (payment window, default 15 min)
   → seller releases        (requires TOTP — this is an irreversible transfer)
   → LOCKED → buyer's balance
```

- **Timeout:** the payment window expires → order cancelled → funds unlocked. The timer is a
  durable job, not an in-process `setTimeout`; a restart must not strand someone's money.
- **Dispute:** either side can escalate. The order moves to `DISPUTED`, both timers stop, and
  only an arbitrator role can resolve it. Resolution is a typed, audited ledger posting — never
  an operator moving a balance by hand.
- Funds are locked at **order open**, not at payment confirmation. Anything later allows the same
  balance to be sold twice.

---

## 6. Hardening

Full detail in `docs/16-hardening.md`. The controls this addendum adds:

| Threat | Control |
|---|---|
| Race conditions on balances | `SELECT … FOR UPDATE` in deterministic order inside one transaction; CHECK constraint forbidding negative balances. Already implemented and tested with 10 concurrent spenders. |
| Order/withdrawal flooding | Redis token bucket, atomic Lua. 5 orders/s per user; 1 withdrawal/min. Sustained abuse → temporary IP block. |
| WebSocket abuse | JWT verified at handshake, not per message; ≤ 20 inbound messages/s; per-connection subscription cap; server-side backpressure. |
| Injection | Parameterised queries only; every DTO validated by `class-validator`/`zod`; raw SQL confined to reviewed migrations. |
| Clickjacking inside the Telegram frame | `X-Frame-Options: DENY` on the website; the TMA route group instead sets a CSP `frame-ancestors` allow-list naming Telegram's origins only. Both are needed — `DENY` everywhere would break the Mini App, and omitting it everywhere would allow framing the site. |
| Credential stuffing / 2FA brute force | 3 consecutive failed 2FA attempts → **withdrawals frozen 24h**, security event raised, user notified. |
| Transport | TLS 1.3, HSTS with preload, `nosniff`, strict CSP, no inline script. |

**The security log physically cannot contain a secret**: it accepts a typed event, not a free
string, and the serialiser has a deny-list for key material. A logger that *should not* log
secrets eventually does.

---

## 7. Delivery

`docs/09-roadmap.md` MVP24–MVP31. Ordering principle unchanged: **the ledger and its constraints
land before anything that moves money through them.** The matching engine is not the first thing
built — an engine with nothing safe to settle into is a demo.
