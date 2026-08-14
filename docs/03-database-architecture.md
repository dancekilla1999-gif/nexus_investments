# Database Architecture

**Engine:** PostgreSQL 16. **ORM/migrations:** Prisma. Canonical schema lives at
`apps/api/prisma/schema.prisma` — this document explains the *design*, not just the tables.

## 1. Core principle: the ledger, not the chain, is truth

A blockchain confirmation tells us money *arrived at an address we control*. It does not tell
us *which user's balance* that belongs to, what state that balance is in (available vs.
locked in an open order vs. locked in a P2P escrow), or what already happened to it inside the
platform. That mapping is entirely internal, and it is entirely captured by a **double-entry
ledger** (`ledger_accounts` + `ledger_entries`), independent of `wallet_addresses` and
on-chain `transactions`.

Flow, exactly as specified in the PRD:

```
Deposit:    Blockchain confirmation → Custody Wallet → Internal Ledger → User Balance
Withdrawal: User Request → Risk Engine → AML Check → Approval → Wallet Service → Blockchain → Confirmation
```

Every balance-affecting event creates **at least two ledger_entries that sum to zero** for a
given asset (a debit and a credit), tied to one `ledger_transactions` row. A user's displayed
balance is never a stored mutable column — it is a materialized, cached *projection*
(`balances` table) that is rebuilt from `ledger_entries` and can be recomputed from scratch at
any time as a reconciliation check. This is what makes double-spending and duplicate-credit
bugs structurally caught, not just tested-for.

## 2. Balance types (per user, per asset)

| Balance | Meaning |
|---|---|
| `available` | Free to trade, withdraw, or transfer |
| `trading` | Moved into the trading subsystem (open orders reserve from here) |
| `locked` | Reserved against an open order, withdrawal request, or P2P escrow |
| `funding` | Wallet-side balance not yet moved into trading |
| `bonus` | Non-withdrawable promotional balance (own ledger account type, never mixed with real funds) |
| `pending` | Deposit seen on-chain, awaiting required confirmations |
| `pending_subscription` | Committed to an investment strategy but not yet at a dealing point — **still the user's**, and returned in full if cancelled (`docs/12` §2.2) |

Plus the non-user **ownership domains** introduced by the Investment Management addendum
(`docs/12` §1). These are not user buckets; they are what makes "whose money is this?" a
question the ledger can actually answer:

| Domain | Owner |
|---|---|
| `strategy_pool` | The investors of that strategy, collectively, pro rata by units |
| `platform_treasury` | The platform |
| `platform_revenue` | The platform (settled fees) |
| `external`, `sandbox_mint` | Nobody — boundary contra-accounts |

A database trigger forbids any ledger transaction that places a user or pool account on one side
and a platform account on the other, unless its type is one of the named fee/settlement types
whose amount comes from the fee engine. That trigger — not a service-layer check — is what makes
"an administrator cannot take user funds" a property of the system rather than a promise.

Modeled as a `ledger_account_type` enum × `balance_bucket` enum pair, not six separate columns
— see schema. Moving funds between buckets (`Wallet → Trading`, `Trading → Wallet`,
`Wallet → P2P`, `P2P → Wallet`) is itself a ledger transaction between two ledger accounts
owned by the same user, never a raw `UPDATE balance = balance + x`.

## 3. Idempotency

Every table that represents a financial mutation (`deposits`, `withdrawals`, `orders`,
`trades`, `ledger_transactions`, `p2p_orders`) carries a caller-supplied or
deterministically-derived `idempotency_key` with a unique constraint. Retried webhook
deliveries, retried API calls, and re-processed queue jobs are safe by construction: the
second write hits the unique constraint and is treated as "already applied," not reapplied.
Chain-sourced events (deposits) are keyed by `(chain_id, tx_hash, log_index)`.

## 4. Entity groups

**Identity & access:** `users`, `profiles`, `devices`, `api_keys`, `audit_logs`

**Compliance:** `kyc_cases`, `aml_cases`, `risk_events`

**Custody & chain:** `chains`, `assets`, `wallets`, `wallet_addresses`, `transactions`
(on-chain, read-only mirror of what the chain adapters observed)

**Ledger (system of record for money):** `ledger_accounts`, `ledger_transactions`,
`ledger_entries`, `balances` (materialized projection)

**Money movement (user-facing views over the ledger):** `deposits`, `withdrawals`

**Trading:** `markets`, `market_data`, `orders`, `trades`

**P2P:** `p2p_ads`, `p2p_orders`, `p2p_disputes`

**Signals/AI:** `indicators` (catalog, not per-run data), `signals`, `signal_results`

**Content/context:** `news`, `macro_events`

**Growth/monetization:** `subscription_plans`, `subscriptions`, `referrals`

**Platform:** `notifications`, `audit_logs` (shared), `risk_events` (shared)

Full column-level definitions: `apps/api/prisma/schema.prisma` (MVP1 tables are fully
implemented and migrated; MVP2+ tables are defined now so the schema is stable end-to-end,
and are built out module-by-module per `09-roadmap.md`).

## 5. Immutability of audit trail

`audit_logs` and `ledger_entries` are **append-only** at the application layer (no
`UPDATE`/`DELETE` service methods exist for them) and additionally protected by a Postgres
`REVOKE UPDATE, DELETE` on those tables for the application's runtime role — only a separate,
narrowly-granted migration role can alter them, and only via a reviewed migration. Corrections
are made by inserting a compensating entry, never by editing history.

## 6. Multi-tenancy of chains/assets

`chains` and `assets` are data, not code — adding a new chain or asset is a row insert plus a
new `BlockchainAdapter` implementation (see `06-blockchain-architecture.md`), never a schema
migration. `wallet_addresses` and `balances` reference `chains`/`assets` by ID so the set of
supported networks/assets can grow without touching existing data.

## 7. Migrations

- Managed by `prisma migrate`. Every migration is a reviewed, checked-in SQL file
  (`apps/api/prisma/migrations/*/migration.sql`) — no `db push` in staging/production.
- Financial-table migrations require a second reviewer and a rollback note in the PR, by team
  convention (documented in `apps/api/prisma/README.md`).
- `apps/api/prisma/seed.ts` seeds only reference data (chains, assets, subscription plan
  tiers, the default RBAC roles) — never fake user/financial data outside `development`.

## 8. Read scaling (future)

Postgres logical replication → read replica for `market_data`/`signals`/reporting queries once
they contend with OLTP traffic; not needed at MVP scale. `balances` projection plus targeted
indexes (see schema `@@index` blocks) cover MVP1–MVP6 read patterns without one.
