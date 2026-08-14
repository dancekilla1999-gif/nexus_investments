# 16. Hardening — the database schema for the hybrid exchange, and the controls around it

> Companion to `docs/15`. Part 1 is the PostgreSQL schema the new modules need, expressed as the
> DDL that will become migrations. Part 2 is the control set, with the reasoning that makes each
> one load-bearing rather than a checklist item.

---

## Part 1 — Schema additions

Conventions carried from `docs/03`: money and quantities are `NUMERIC(36,18)`; every financial
mutation carries a unique idempotency key; history tables reject UPDATE and DELETE by trigger.

### 1.1 Telegram identity

```sql
-- A Telegram account is an additional identity for a user, never a second user record.
-- Nullable telegram_id on `users` would let two rows claim one Telegram account; a separate
-- table with a unique constraint cannot.
CREATE TABLE telegram_identities (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users(id),
  telegram_id    BIGINT NOT NULL UNIQUE,
  username       TEXT,
  language_code  TEXT,
  photo_url      TEXT,
  is_premium     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Highest auth_date seen. A replayed initData carries an older timestamp, so refusing to go
  -- backwards makes replay useless even inside the freshness window.
  last_auth_date TIMESTAMPTZ NOT NULL,
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_id_positive CHECK (telegram_id > 0)
);

-- OTP codes delivered to the user's private chat. Hashes only: a leaked table must not be a
-- list of live codes.
CREATE TABLE telegram_otp_challenges (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  purpose      TEXT NOT NULL,            -- withdrawal | pin_change | p2p_release | login
  code_hash    TEXT NOT NULL,
  attempts     INT  NOT NULL DEFAULT 0,
  max_attempts INT  NOT NULL DEFAULT 3,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON telegram_otp_challenges (user_id, purpose) WHERE consumed_at IS NULL;
```

### 1.2 Self-custody wallets

```sql
CREATE TYPE custody_mode AS ENUM ('SELF_CUSTODY', 'CUSTODIAL');

-- The server stores a blob it cannot decrypt. KDF parameters live beside it so they can be
-- raised later without stranding existing backups.
CREATE TABLE self_custody_backups (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id),
  ciphertext      BYTEA NOT NULL,        -- AES-GCM(seed), client-side
  iv              BYTEA NOT NULL,
  auth_tag        BYTEA NOT NULL,
  kdf             TEXT  NOT NULL DEFAULT 'PBKDF2-SHA256',
  kdf_salt        BYTEA NOT NULL,
  kdf_iterations  INT   NOT NULL,
  cipher          TEXT  NOT NULL DEFAULT 'AES-256-GCM',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at      TIMESTAMPTZ,
  CONSTRAINT kdf_iterations_sufficient CHECK (kdf_iterations >= 100000),
  -- Belt and braces against a future bug that tries to store something recognisable.
  CONSTRAINT ciphertext_is_binary CHECK (octet_length(ciphertext) BETWEEN 16 AND 4096)
);

-- Addresses the user controls themselves. The platform watches them; it cannot spend from them.
CREATE TABLE self_custody_addresses (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  chain_id       TEXT NOT NULL REFERENCES chains(id),
  address        TEXT NOT NULL,
  derivation_path TEXT,
  label          TEXT,
  verified_at    TIMESTAMPTZ,            -- proven by signature, not merely typed in
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, address)
);
```

### 1.3 Markets and the matching engine

```sql
CREATE TYPE market_kind      AS ENUM ('SPOT_CRYPTO', 'EQUITY', 'FIAT_PAIR');
CREATE TYPE execution_mode   AS ENUM ('INTERNAL_BOOK', 'ROUTED', 'HYBRID');
CREATE TYPE order_side       AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type       AS ENUM ('MARKET','LIMIT','STOP','STOP_LIMIT','OCO');
CREATE TYPE time_in_force    AS ENUM ('GTC','IOC','FOK','DAY');
CREATE TYPE order_status     AS ENUM
  ('PENDING_RISK','OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED','EXPIRED');

CREATE TABLE markets (
  id                TEXT PRIMARY KEY,
  symbol            TEXT NOT NULL UNIQUE,          -- BTC-USDT, AAPL-USD
  kind              market_kind NOT NULL,
  base_asset_id     TEXT NOT NULL REFERENCES assets(id),
  quote_asset_id    TEXT NOT NULL REFERENCES assets(id),
  execution_mode    execution_mode NOT NULL DEFAULT 'ROUTED',
  -- Quantisation. Orders off the grid are rejected rather than silently rounded: rounding a
  -- user's order is deciding on their behalf what they meant.
  tick_size         NUMERIC(36,18) NOT NULL,
  lot_size          NUMERIC(36,18) NOT NULL,
  min_notional      NUMERIC(36,18) NOT NULL,
  maker_fee_bps     INT NOT NULL DEFAULT 0,
  taker_fee_bps     INT NOT NULL DEFAULT 0,
  is_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  trading_hours     JSONB,                          -- null = 24/7; equities carry a calendar
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT market_assets_differ CHECK (base_asset_id <> quote_asset_id),
  CONSTRAINT market_sizes_positive CHECK (tick_size > 0 AND lot_size > 0 AND min_notional >= 0),
  CONSTRAINT market_fees_sane CHECK (maker_fee_bps BETWEEN -100 AND 1000
                                 AND taker_fee_bps BETWEEN 0 AND 1000)
);

CREATE TABLE orders (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  market_id          TEXT NOT NULL REFERENCES markets(id),
  -- Set when the order trades pooled capital rather than the user's own.
  strategy_id        TEXT REFERENCES investment_strategies(id),
  side               order_side  NOT NULL,
  type               order_type  NOT NULL,
  time_in_force      time_in_force NOT NULL DEFAULT 'GTC',
  quantity           NUMERIC(36,18) NOT NULL,
  price              NUMERIC(36,18),                -- null for MARKET
  stop_price         NUMERIC(36,18),
  filled_quantity    NUMERIC(36,18) NOT NULL DEFAULT 0,
  avg_fill_price     NUMERIC(36,18),
  status             order_status NOT NULL DEFAULT 'PENDING_RISK',
  -- The ledger transaction that locked the funds this order can spend. An OPEN order without
  -- one would be an order backed by nothing.
  lock_transaction_id TEXT REFERENCES ledger_transactions(id),
  -- Assigned by the engine at admission; the total order across the whole market. This, not
  -- created_at, is what FIFO fairness is defined by — wall clocks are not monotonic.
  sequence_number    BIGINT,
  idempotency_key    TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_fill_within_quantity CHECK (filled_quantity >= 0 AND filled_quantity <= quantity),
  CONSTRAINT limit_orders_have_price CHECK (type <> 'LIMIT' OR price IS NOT NULL),
  CONSTRAINT stop_orders_have_stop CHECK (type NOT IN ('STOP','STOP_LIMIT') OR stop_price IS NOT NULL),
  CONSTRAINT open_orders_are_funded CHECK (status IN ('PENDING_RISK','REJECTED') OR lock_transaction_id IS NOT NULL)
);
CREATE INDEX ON orders (market_id, status) WHERE status IN ('OPEN','PARTIALLY_FILLED');
CREATE INDEX ON orders (user_id, created_at DESC);
CREATE UNIQUE INDEX ON orders (market_id, sequence_number) WHERE sequence_number IS NOT NULL;

-- Append-only. A trade is a historical fact.
CREATE TABLE trades (
  id                TEXT PRIMARY KEY,
  market_id         TEXT NOT NULL REFERENCES markets(id),
  maker_order_id    TEXT REFERENCES orders(id),
  taker_order_id    TEXT REFERENCES orders(id),
  price             NUMERIC(36,18) NOT NULL,
  quantity          NUMERIC(36,18) NOT NULL,
  maker_fee         NUMERIC(36,18) NOT NULL DEFAULT 0,
  taker_fee         NUMERIC(36,18) NOT NULL DEFAULT 0,
  -- Set for ROUTED/HYBRID fills; the pair is what makes external fills idempotent.
  venue_key         TEXT,
  venue_execution_id TEXT,
  settlement_transaction_id TEXT REFERENCES ledger_transactions(id),
  executed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trade_positive CHECK (price > 0 AND quantity > 0),
  CONSTRAINT internal_trade_has_both_sides
    CHECK (venue_key IS NOT NULL OR (maker_order_id IS NOT NULL AND taker_order_id IS NOT NULL))
);
CREATE UNIQUE INDEX ON trades (venue_key, venue_execution_id) WHERE venue_key IS NOT NULL;
CREATE INDEX ON trades (market_id, executed_at DESC);

-- The engine's durable input. The book is derived from this and can always be rebuilt; the log
-- is the truth about ordering, and an in-memory book is never the record of anything.
CREATE TABLE engine_commands (
  sequence_number BIGSERIAL PRIMARY KEY,
  market_id       TEXT NOT NULL REFERENCES markets(id),
  command         TEXT NOT NULL,                    -- PLACE | CANCEL | AMEND
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE engine_snapshots (
  id              TEXT PRIMARY KEY,
  market_id       TEXT NOT NULL REFERENCES markets(id),
  sequence_number BIGINT NOT NULL,                  -- replay resumes from here
  book            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, sequence_number)
);
```

### 1.4 P2P

```sql
CREATE TYPE p2p_ad_side     AS ENUM ('BUY','SELL');
CREATE TYPE p2p_order_status AS ENUM
  ('CREATED','FUNDS_LOCKED','PAYMENT_SENT','RELEASED','CANCELLED','EXPIRED','DISPUTED','RESOLVED');

CREATE TABLE p2p_ads (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  side            p2p_ad_side NOT NULL,
  asset_id        TEXT NOT NULL REFERENCES assets(id),
  fiat_currency   TEXT NOT NULL,
  price           NUMERIC(36,18) NOT NULL,
  min_amount      NUMERIC(36,18) NOT NULL,
  max_amount      NUMERIC(36,18) NOT NULL,
  payment_methods JSONB NOT NULL,
  terms           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2p_ad_amounts CHECK (min_amount > 0 AND max_amount >= min_amount),
  CONSTRAINT p2p_ad_price_positive CHECK (price > 0)
);

CREATE TABLE p2p_orders (
  id                   TEXT PRIMARY KEY,
  ad_id                TEXT NOT NULL REFERENCES p2p_ads(id),
  buyer_id             TEXT NOT NULL REFERENCES users(id),
  seller_id            TEXT NOT NULL REFERENCES users(id),
  asset_id             TEXT NOT NULL REFERENCES assets(id),
  amount               NUMERIC(36,18) NOT NULL,
  price                NUMERIC(36,18) NOT NULL,
  fiat_amount          NUMERIC(36,18) NOT NULL,
  status               p2p_order_status NOT NULL DEFAULT 'CREATED',
  -- Escrow is a ledger lock, not a flag. Funds are locked at order open, not at payment
  -- confirmation: anything later lets the same balance be sold twice.
  escrow_lock_transaction_id    TEXT REFERENCES ledger_transactions(id),
  escrow_release_transaction_id TEXT REFERENCES ledger_transactions(id),
  payment_deadline     TIMESTAMPTZ NOT NULL,
  payment_marked_at    TIMESTAMPTZ,
  released_at          TIMESTAMPTZ,
  idempotency_key      TEXT NOT NULL UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2p_counterparties_differ CHECK (buyer_id <> seller_id),
  CONSTRAINT p2p_amount_positive CHECK (amount > 0),
  CONSTRAINT p2p_locked_states_have_escrow
    CHECK (status IN ('CREATED','CANCELLED') OR escrow_lock_transaction_id IS NOT NULL)
);
CREATE INDEX ON p2p_orders (status, payment_deadline) WHERE status = 'FUNDS_LOCKED';

CREATE TABLE p2p_disputes (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL UNIQUE REFERENCES p2p_orders(id),
  raised_by     TEXT NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL,
  evidence      JSONB,
  arbitrator_id TEXT REFERENCES users(id),
  resolution    TEXT,
  resolved_in_favour_of TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
```

### 1.5 Security events

```sql
CREATE TYPE security_event_kind AS ENUM (
  'IP_CHANGE','NEW_DEVICE','TOTP_FAILURE','PIN_FAILURE','OTP_FAILURE',
  'RATE_LIMIT_TRIPPED','ANOMALOUS_VOLUME','WITHDRAWAL_FROZEN',
  'INITDATA_INVALID','SESSION_HIJACK_SUSPECTED'
);

-- Append-only, and structurally incapable of holding a secret: typed fields plus a JSONB
-- `context` written through a serialiser with a key-material deny-list. A logger that merely
-- *should not* log secrets eventually does.
CREATE TABLE security_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  kind        security_event_kind NOT NULL,
  severity    INT NOT NULL DEFAULT 1,
  ip          INET,
  user_agent  TEXT,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT security_severity_range CHECK (severity BETWEEN 1 AND 5)
);
CREATE INDEX ON security_events (user_id, created_at DESC);
CREATE INDEX ON security_events (kind, created_at DESC);

-- An automatic freeze after repeated 2FA failure. Stored rather than computed so the block
-- survives a restart and is visible to support without re-deriving it.
CREATE TABLE withdrawal_freezes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  frozen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  lifted_at   TIMESTAMPTZ,
  lifted_by   TEXT REFERENCES users(id)
);
CREATE INDEX ON withdrawal_freezes (user_id) WHERE lifted_at IS NULL;
```

### 1.6 Fiat gateway

```sql
CREATE TYPE fiat_direction AS ENUM ('DEPOSIT','WITHDRAWAL');
CREATE TYPE fiat_status    AS ENUM ('INITIATED','PENDING','COMPLETED','FAILED','REFUNDED');

CREATE TABLE fiat_transactions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  direction          fiat_direction NOT NULL,
  currency           TEXT NOT NULL,
  amount             NUMERIC(36,18) NOT NULL,
  fee                NUMERIC(36,18) NOT NULL DEFAULT 0,
  provider           TEXT NOT NULL,
  provider_reference TEXT,
  status             fiat_status NOT NULL DEFAULT 'INITIATED',
  ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
  idempotency_key    TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  CONSTRAINT fiat_amount_positive CHECK (amount > 0),
  -- A completed transfer that never hit the ledger is money the books do not know about.
  CONSTRAINT fiat_completed_is_posted
    CHECK (status <> 'COMPLETED' OR ledger_transaction_id IS NOT NULL)
);
CREATE UNIQUE INDEX ON fiat_transactions (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
```

### 1.7 Extending what exists

```sql
-- Which custody mode a ledger account belongs to. Investment, escrow and pooled trading are
-- valid only on CUSTODIAL accounts — the platform cannot sign for the others.
ALTER TABLE ledger_accounts ADD COLUMN custody custody_mode NOT NULL DEFAULT 'CUSTODIAL';

ALTER TABLE ledger_transaction_type ADD VALUE 'ESCROW_LOCK';       -- separate migrations,
ALTER TABLE ledger_transaction_type ADD VALUE 'ESCROW_RELEASE';    -- one value each
ALTER TABLE ledger_transaction_type ADD VALUE 'ESCROW_REFUND';
ALTER TABLE ledger_transaction_type ADD VALUE 'FIAT_SETTLEMENT';
```

---

## Part 2 — Controls

### 2.1 Race conditions

Already implemented and proven: ten concurrent attempts to spend one balance leave exactly one
succeeding, against a real PostgreSQL. The rules that make it hold:

- Check-and-spend is **one** transaction. Never read, decide, then write.
- `SELECT … FOR UPDATE` in **deterministic id order** — two postings touching the same accounts
  in opposite orders would otherwise deadlock.
- A CHECK constraint forbids negative user balances, so a logic bug is still refused by the
  database.
- `SET CONSTRAINTS ALL IMMEDIATE` before commit, because Prisma swallows errors raised during its
  own COMMIT and would otherwise report success on a rolled-back write.

`SERIALIZABLE` is deliberately not used platform-wide: it converts contention into serialisation
failures that every caller must retry, and row locks express the intent more precisely. It is
reserved for the few multi-row invariants that need it.

### 2.2 Rate limiting

Redis token bucket, atomic Lua — the in-memory default silently stops working the moment there is
more than one API process, which is exactly when it matters.

| Endpoint class | Limit |
|---|---|
| Order placement | 5/s per user |
| Withdrawal request | 1/min per user |
| Auth (login, register, 2FA) | strict per-IP and per-account |
| WebSocket inbound | 20/s per connection |
| Everything else | 120/min default |

Sustained abuse escalates to a temporary IP block and a `RATE_LIMIT_TRIPPED` security event.
Blocks are time-boxed and recorded, never permanent and silent.

### 2.3 WebSockets

JWT verified **at handshake**, not per message — a socket that authenticated once and then had
its token revoked must be disconnected, so revocation is pushed to live connections rather than
waited on. Per-connection subscription caps and server-side backpressure; a slow consumer is
disconnected rather than allowed to grow an unbounded buffer.

### 2.4 Transport and headers

TLS 1.3. `Strict-Transport-Security` with preload, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a CSP with no `unsafe-inline`.

Framing needs two different answers and getting this wrong breaks one of the two products:

- Website routes: `X-Frame-Options: DENY`.
- TMA routes: no `DENY`; instead `frame-ancestors` naming Telegram's origins only.

CORS allow-lists exact origins. Telegram webhooks are authenticated by secret token **and**
source-IP allow-list, not by either alone.

### 2.5 Anti-fraud

The security logger takes a **typed event**, never a formatted string, and its serialiser carries
a deny-list for key material. Rules that act automatically:

- 3 consecutive 2FA/PIN failures → withdrawals frozen 24h, user notified, event raised.
- Session IP changing country mid-session → step-up re-authentication required.
- Volume anomalous against the account's own history → withdrawal held for review.

Automatic actions are always **restrictive** (freeze, hold, require re-auth) and never
destructive. An automated system that can move or seize funds is a new attack surface, not a
control.
