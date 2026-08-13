# Managed Accounts (Investor / Discretionary Trading) Architecture

## 0. What this feature is, in one sentence

An investor deposits capital, explicitly consents in writing to a risk disclosure, and
authorizes the platform (a human trader, an in-house desk, or a validated algorithmic
strategy) to place trades on their behalf inside a segregated sub-account that can never lose
more than a hard-capped, pre-agreed percentage of the capital allocated to it.

## 1. Read this first: regulatory posture

This is **not** "another feature" — it is a different, more heavily regulated business than
the rest of the platform. Custody (holding a user's crypto) already requires MSB/VASP-type
registration in most jurisdictions (`docs/01-PRD.md §8`). **Discretionary trading of a
client's funds, especially with any profit-sharing, is investment-adviser / asset-management
activity** — in the US this implicates the Investment Advisers Act (and potentially
broker-dealer / CTA-CPO rules if derivatives are involved); in the EU/UK it implicates
MiFID II / FCA discretionary portfolio management permissions; most jurisdictions have direct
equivalents. **None of this is legal advice, and none of it is a substitute for licensed
counsel in every jurisdiction this is offered in, before it is offered.**

Consequences for this architecture:

- Every Managed Account created by this codebase starts — and, absent a signed compliance
  attestation exactly like `PLATFORM_MODE=live` (`docs/02-system-architecture.md §4`), stays —
  in **`sandbox`/paper mode**. No managed account trades real capital until a jurisdiction-by-
  jurisdiction legal review has happened, mirroring `docs/01-PRD.md §8` but for a stricter bar.
- The risk-disclosure consent flow (§3) is not a UX nicety. It is the legal record that the
  investor was told, before any capital was allocated, exactly what could go wrong. It is
  designed to be defensible in a dispute, which drives the immutability and audit requirements
  below.
- Nothing in this system ever states or implies a guaranteed, expected, or typical return.
  Copy from `docs/07-ai-signal-architecture.md §10`'s banned-phrase guardrail applies here with
  zero exceptions.

## 2. Structural choice: segregated sub-accounts, not a pooled fund

Two ways to build "invest, and someone else trades for you":

| Model | How it works | Regulatory shape |
|---|---|---|
| **Pooled fund** | All investors' capital is commingled into one trading account; investors hold units/shares of the pool. | Legally closest to operating an unregistered investment fund — the heaviest regulatory lift, and the hardest to unwind if wrong. |
| **Segregated managed sub-accounts (chosen)** | Each investor's capital stays in *their own* ledger-scoped sub-account. The manager/strategy places trades that execute identically (proportionally) across every subscribed sub-account, but never moves capital between investors. | Still discretionary-management activity requiring licensing, but the investor retains direct, traceable ownership of specific funds at all times — no pooling, no NAV/unit accounting, no fund-formation law layered on top. |

**We build the segregated model.** It is more work per-trade (the execution layer fans one
trading decision out to N sub-accounts, position-sized independently per sub-account) but it
is the safer, more defensible, and more scalable choice: it doesn't require fund
administration, NAV calculation, or redemption-gate mechanics, and an investor's funds are
never at risk from another investor's position.

## 3. Risk Disclosure Agreement & consent

- `RiskDisclosureAgreement` is a versioned, admin-authored legal document (title + body,
  effective date). Only one version is "current" at a time; publishing a new version does
  **not** retroactively silence acceptance of a prior version — both remain in the audit
  trail forever.
- Opening (or keeping open) a Managed Account requires an unexpired acceptance of the
  *current* agreement version. `RiskDisclosureAcceptance` records `(userId, agreementId,
  acceptedAt, ip, userAgent)` — **insert-only**, same immutability convention as `AuditLog` /
  `LedgerEntry` (`docs/03-database-architecture.md §5`). There is no "implied consent" path —
  no checkbox pre-ticked, no "by depositing you agree." The user reads the current document
  and takes an explicit accept action, logged with the same rigor as a financial transaction.
- A new agreement version automatically re-requires acceptance from every investor with an
  open Managed Account before they can allocate additional capital or before the platform can
  place a new trade on their behalf (exact enforcement point lands with account-creation
  logic in a later milestone — the acceptance *record* is built now, in this delivery, so it's
  ready).
- The agreement text itself is a legal document that must be drafted (or reviewed) by
  licensed counsel per jurisdiction before `PLATFORM_MODE=live` — this repository seeds a
  clearly-labeled placeholder draft, never real legal copy pretending to be final.

## 4. The 10% hard risk cap

Product requirement, restated precisely: **a Managed Account may never be configured to risk
more than 10% of its allocated capital, and that cap is a hard platform ceiling, not a
suggestion** — an investor or manager may set a *stricter* (lower) limit, never a looser one.

Modeled as `ManagedAccount.maxDrawdownBps` (basis points; `1000` = 10%), with:

- **Application-level validation** rejecting any value `> 1000` at account creation *and* at
  any later update — enforced in the service layer, not just the UI, so it can't be bypassed
  via direct API calls (same principle as every other risk control in this codebase).
- **`highWaterMark`**: the highest capital value the account has reached (starts equal to
  `initialCapital`, ratchets up on profit, never down). Drawdown is measured from the
  high-water mark, not the original deposit alone — the standard, more conservative
  convention (protects gains, not just the initial stake).
- **Circuit breaker**: the Risk Engine (`docs/05-security-architecture.md §6`) evaluates
  current equity against `highWaterMark * (1 - maxDrawdownBps / 10000)` on every
  equity-changing event (fill, funding update, mark-to-market tick). Breaching it:
  1. Immediately blocks any new order that would *increase* risk on that account (the account
     moves to `CIRCUIT_BROKEN` status — enforced the same way `PlatformModeGuard` blocks live
     trading, at the service layer, not the UI).
  2. Writes a `risk_events` row (`type: MANAGED_ACCOUNT_CIRCUIT_BREAKER`, `severity: high`) —
     pages risk ops the same way any other high-severity risk event does.
  3. Notifies the investor immediately (`NotificationType.SECURITY_ALERT`-equivalent — a new
     `RISK_ALERT` type is added in the Notifications module when this ships).
  4. Does **not** auto-liquidate open positions by default — forced market-selling into a
     drawdown can realize a worse price than an orderly close. Auto-flatten is an explicit,
     separate opt-in the investor can set at account creation (`autoFlattenOnBreach: boolean`)
     for those who want the stricter behavior; the default requires a manager/admin
     acknowledgment before any further action, logged the same way a P2P dispute resolution
     is.
- The 10,% figure and the high-water-mark convention are deliberately encoded as named,
  documented fields (not a magic number in application logic) so a future compliance review
  can audit the exact rule instead of reverse-engineering it from code.

## 5. Ledger integration

A `ManagedAccount` does **not** introduce a new `LedgerAccountType` — it introduces a new
*owning context*. `ledger_accounts` gains a nullable `managedAccountId` alongside the existing
`userId`: a managed account's `AVAILABLE`/`TRADING`/`LOCKED` balances are ledger accounts
scoped to `(userId, managedAccountId, assetId, type)` instead of `(userId, assetId, type)`.
This means:

- All the existing ledger guarantees (double-entry, idempotency, immutable audit trail —
  `docs/03-database-architecture.md`) apply unchanged.
- A user's self-directed trading balance and their Managed Account balance are structurally
  incapable of being commingled — moving funds between them is itself a ledger transaction
  (`LedgerTransactionType.TRANSFER_INTERNAL`), exactly like Wallet ↔ Trading transfers.
- Reconciliation (`docs/06-blockchain-architecture.md §5`) extends naturally: sum of a managed
  account's ledger entries must equal its tracked equity at all times.

## 6. Trade allocation (fan-out execution)

When the manager/strategy decides "buy X", the Trading module (MVP4+) fans that decision out
to every Managed Account subscribed to that strategy:

1. Compute each account's position size independently (typically a fixed fraction of that
   account's *own* current equity, respecting its individual `maxDrawdownBps` headroom) — never
   a shared quantity split pro-rata from one parent order, since accounts have independent
   balances and independent risk budgets.
2. Submit one order per account through the same order pipeline every self-directed trade
   uses (no privileged/bypass path) — a Managed Account trade is an `Order` row like any
   other, just placed by the manager's identity (`Order.placedByManagerId` alongside the
   owning `userId`) instead of the account owner directly.
3. Partial fills, rejections, or an account being `CIRCUIT_BROKEN` at execution time are
   handled per-account — one investor's account failing to fill never blocks or distorts
   another's.

## 7. Fees

Performance fee (percentage of realized net profit *above the high-water mark* — the standard
convention that stops charging fees on gains that merely recover a prior loss) and an optional
management fee (percentage of AUM per period), both configurable via the existing Fee Engine
tables (`docs/03-database-architecture.md`, `FeeSchedule`), never hardcoded, and always shown
to the investor before they authorize the account — consistent with PRD §20's "no hardcoded
fees" principle and the "fees shown before confirmation" UX rule in
`docs/08-ui-ux-architecture.md §2`.

## 8. What ships in this delivery vs. later

**Ships now (schema + a real, working slice):**
- Full data model below (§9) — additive, non-breaking, matches the project's "schema stable
  early, services land per milestone" convention.
- A real `RiskDisclosureAgreement` / `RiskDisclosureAcceptance` backend and frontend: investors
  can read the current agreement and record acceptance today. This is the compliance
  precondition every later piece depends on, so it's built first and built for real — not
  mocked.

**Explicitly not built yet (needs MVP2/MVP4/MVP6 first, tracked in `docs/09-roadmap.md
§MVP11`):** account creation/funding, the circuit breaker's live enforcement, trade fan-out
execution, fee settlement. None of it can honestly exist before the Ledger (MVP2), Trading
(MVP4), and Signal/Backtesting Engine (MVP6, `docs/11-backtesting-architecture.md`) it depends
on.

## 9. Data model additions

```
RiskDisclosureAgreement
  id, version (unique, monotonic), title, bodyMarkdown, isCurrent, effectiveAt, createdAt

RiskDisclosureAcceptance   -- insert-only
  id, userId, agreementId, acceptedAt, ip, userAgent

ManagedAccount
  id, userId (investor), status [PENDING_AGREEMENT|ACTIVE|CIRCUIT_BROKEN|CLOSED],
  strategyId (nullable — set once MVP11's strategy assignment ships),
  initialCapital, highWaterMark, maxDrawdownBps (<=1000, enforced),
  autoFlattenOnBreach (bool), createdAt, closedAt

-- ledger_accounts gains a nullable managedAccountId (see §5)
-- risk_events gains RiskEventType.MANAGED_ACCOUNT_CIRCUIT_BREAKER
-- orders gains a nullable placedByManagerId (see §6)
```

See `apps/api/prisma/schema.prisma` for the exact Prisma definitions and
`docs/11-backtesting-architecture.md` for `TradingStrategy` / `BacktestRun` / `BacktestResult`.
