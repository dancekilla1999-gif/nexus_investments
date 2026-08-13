# Nexus Investments — Product Requirements Document (PRD)

**Status:** Draft v1.0 · **Owner:** CTO / Founding Engineering · **Last updated:** 2026-08-13

> This document defines *what* we are building and *why*. It is the parent document for the
> eight companion architecture documents in this `docs/` folder (system, database, API,
> security, blockchain, AI signal, UI/UX, roadmap). Read this first.

---

## 1. Vision

Nexus Investments is a premium, institutional-grade digital-asset investing and trading
platform. A user can register, pass KYC/AML, custody crypto in a platform-managed multi-chain
wallet, deposit and withdraw on-chain, trade spot markets on a proprietary matching/execution
stack, trade peer-to-peer with escrow, subscribe to an AI-assisted signal and research engine,
and manage risk — all from one account, one balance sheet, one audit trail.

We are **not** building a themed frontend over someone else's exchange. We are building the
ledger, the wallet custody layer, the trading engine, the compliance surface, and the data/AI
layer ourselves, with the operational discipline a regulator, an auditor, and an attacker will
all eventually examine.

## 2. Non-negotiable product principles

1. **The internal ledger is the source of truth for user balances — never the raw chain
   balance.** See `03-database-architecture.md` and `06-blockchain-architecture.md`.
2. **No feature ships as "real" unless its money-movement path has a risk engine, an audit
   trail, and a reconciliation story.** Anything short of that is explicitly labeled
   `sandbox` / `testnet` in the UI — never disguised as live.
3. **No guaranteed-return or guaranteed-accuracy language anywhere** — not in signals, not in
   AI assistant output, not in marketing copy. Confidence scores and historical stats only.
4. **Security and compliance are launch-blocking, not backlog items.** KYC/AML, sanctions
   screening, and withdrawal risk controls ship in the same milestone as withdrawals, not after.
5. **Every financial mutation is idempotent, double-entry, and immutable-audited.** See
   `03-database-architecture.md §Ledger`.
6. **Modular services, not a monolith.** Each bounded context in §7 is a separately deployable
   NestJS module today, a separately deployable service tomorrow, without a rewrite.

## 3. Target users

- **Retail investor** — wants a safe place to hold and grow crypto, understands basic charts,
  values clear risk disclosure over hype.
- **Active trader** — wants a fast terminal, order types beyond market/limit, low latency data,
  API access for their own bots.
- **P2P participant** — wants fiat on/off-ramp in markets without easy card rails, values
  reputation and escrow safety.
- **Signal/research subscriber** — wants AI-assisted, explainable technical + macro analysis,
  not black-box "buy now" calls.

## 4. Scope of v1 (this repository, MVP1 → MVP10)

See `09-roadmap.md` for the full milestone breakdown. In short:

| # | Milestone | Delivers |
|---|-----------|----------|
| 1 | Auth + User + Dashboard | Registration, login, 2FA, sessions, profile, empty-state dashboard |
| 2 | Wallet + Ledger + Deposit | Multi-chain deposit addresses, double-entry ledger, deposit crediting |
| 3 | Withdrawal + Security | Withdrawal flow, risk engine v1, device/whitelist controls |
| 4 | Market Data + Trading | Market data ingestion, spot order book, order/trade execution |
| 5 | P2P | Ads, escrow, order lifecycle, disputes |
| 6 | Signal Engine | Indicator engine, signal generation, performance tracking |
| 7 | AI + News + Macro | News/macro aggregation, AI assistant grounded in platform data |
| 8 | Subscriptions | Plan tiers, entitlements, billing |
| 9 | Admin + Risk + AML | Ops console, AML/sanctions screening, risk dashboards |
| 10 | Production hardening | Load/security testing, DR, observability, compliance review |

**This repository's current state:** architecture complete (all 9 docs), **MVP1 implemented**
(Auth Service, User Service, Dashboard shell). MVP2+ are designed but not yet coded — see
`09-roadmap.md` for exact acceptance criteria of each.

## 5. Explicit non-goals (v1)

- Margin, futures, and copy trading — architecture allows for them (see `02-system-architecture.md`),
  but they do **not** ship until a dedicated risk engine and regulatory review exist.
  Currently in-scope for the trading module: **spot only**.
  If margin/futures ship later, they launch in **testnet/paper mode** first for at least one
  full milestone before any real-money enablement.
- A proprietary L1/L2/appchain. Not justified at this stage; revisit only with a dedicated
  architecture doc if/when volume justifies it (see `06-blockchain-architecture.md §9`).
- Fiat card/bank rails (ACH/SEPA/card) — v1 fiat exposure is limited to P2P, where the
  platform never touches fiat directly (see `05-security-architecture.md` and P2P design).
- Full mobile apps — architecture allows React Native reuse of the API layer, not built in
  this repo yet.

## 6. Success metrics (product)

- **Trust/safety:** zero unreconciled ledger discrepancies; 100% of withdrawals pass through
  the risk engine; mean time to detect a ledger/chain mismatch < 5 min (MVP2+).
- **Signal integrity:** signal win-rate and R/R stats are computed automatically from
  `signal_results`, never hand-edited (MVP6+).
- **Activation:** registered → KYC-approved → first funded balance conversion rate tracked
  from day one (MVP1 dashboard already emits the funnel events).

## 7. Bounded contexts (product view)

Landing · Auth · KYC/AML · Dashboard · Wallet · Deposit · Withdraw · Internal Transfer ·
Spot Trading · Trading Terminal · P2P · Markets · AI Signals · Trading Signals · Portfolio ·
Orders · Transactions · Subscriptions · News & Macro · Market Scanner · Coin Research ·
Notifications · Referral System · Security Center · Profile · Admin Panel · Risk Management ·
Support Center.

Each maps 1:1 to a backend module/service — see `02-system-architecture.md §3`.

## 8. Regulatory posture (v1)

This is a **custodial** platform (we hold user keys / operate hot-cold wallets on their
behalf) the moment MVP2 (Wallet + Ledger) ships. That triggers, depending on jurisdiction:
MSB/VASP registration, KYC/AML program (BSA-style in the US, AMLD/MiCA in the EU, or local
equivalents), sanctions screening, and often custody-specific capital/insurance requirements.

**This repository does not constitute legal advice or a compliance program.** Before enabling
real deposits/withdrawals for real users in any jurisdiction, a licensed compliance/legal
review in that jurisdiction is required — see `05-security-architecture.md §Compliance` and
`09-roadmap.md §MVP10`. Until that review happens, deposit/withdraw is built and demonstrated
in **testnet mode only**, clearly labeled as such in the UI, per Product Principle #2.

## 9. Companion documents

1. `02-system-architecture.md` — services, boundaries, data flow, tech stack
2. `03-database-architecture.md` — full PostgreSQL schema, ledger design
3. `04-api-architecture.md` — REST/WebSocket/webhook contracts, versioning, OpenAPI
4. `05-security-architecture.md` — authN/authZ, key management, compliance controls
5. `06-blockchain-architecture.md` — multi-chain wallet, custody, adapters
6. `07-ai-signal-architecture.md` — indicator engine, signal engine, AI assistant
7. `08-ui-ux-architecture.md` — design system, information architecture, screen inventory
8. `09-roadmap.md` — milestones, acceptance criteria, current implementation status
