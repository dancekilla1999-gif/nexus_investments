# 13. Execution Architecture — Smart Order Router and Liquidity Aggregation

> **Status:** design. This is the "Variant 3 — Liquidity Aggregator / Smart Execution Platform"
> shape: the platform does not run its own order book and does not take the other side of a
> user's trade. It routes to venues that do.

## 1. What this changes about the platform's role

An exchange with its own book is the counterparty to its users, holds the matching engine, and
carries the market-making and market-abuse obligations that follow. An aggregator is an
**agent**: it takes an order intent and gets it filled somewhere else, on the best terms it can
find, and is measured on execution quality rather than on spread capture.

Consequences that shape the code:

- There is **no internal matching engine**. `docs/04` §5's `trading` module becomes an
  *execution* module, not a matching one.
- Every fill has an **external origin** — a venue, an execution id, a venue timestamp — and
  every fill must reconcile against the ledger. A fill the venue reports that the ledger does
  not know about is an incident, not a rounding difference.
- The platform's revenue is a disclosed execution/management fee, not an undisclosed spread.
  Fee schedules live in the fee engine and are never hardcoded in the frontend (`docs/04` §7).

## 2. One execution layer for both modes

Self-trading and managed-strategy trading share the router, the risk engine and the venue
adapters. The only differences are *whose* capital is at risk and *which* mandate applies:

```
Self trade:      user intent    → risk (user limits)     → SOR → venue
Managed trade:   manager intent → risk (strategy mandate) → SOR → venue
```

A single code path means an execution-quality improvement benefits both, and — more importantly
— means there is no privileged route that skips risk checks.

## 3. Venue abstraction

Mirrors the `BlockchainAdapter` pattern that is already proven in this codebase: one interface,
many implementations, no venue-specific logic above the boundary.

```ts
interface ExecutionVenue {
  readonly venueKey: string;
  readonly kind: 'CEX' | 'OTC' | 'DEX' | 'LP' | 'INSTITUTIONAL';

  getQuote(req: QuoteRequest): Promise<Quote>;          // price, size, expiry
  getLiquidity(symbol: string): Promise<DepthSnapshot>;
  placeOrder(order: VenueOrder): Promise<VenueAck>;
  cancelOrder(venueOrderId: string): Promise<void>;
  getFills(since: Date): Promise<VenueFill[]>;          // reconciliation source
  getBalances(): Promise<VenueBalance[]>;               // custody reconciliation
  health(): Promise<VenueHealth>;
}
```

Deliberately **absent**, exactly as with the chain adapters: anything that moves value between
the platform and a venue. Funding a venue account is a custody operation with its own approval
path (`docs/06` §4), not something an order router can trigger.

## 4. Routing decision

For each order the router scores candidate venues on:

| Factor | Why it is not just "best price" |
|---|---|
| Price | The headline, but quoted price ≠ achieved price |
| Available liquidity at size | A better top-of-book that cannot absorb the order is worse |
| Expected slippage | Modelled from depth, not assumed |
| Fees | Venue fee schedule, including maker/taker asymmetry |
| Latency | A stale quote is a rejected fill or a worse one |
| Reliability | Measured fill-rate and rejection history per venue |
| Settlement risk | Counterparty exposure limits per venue |

Large orders may be **split** across venues. Every child order carries the parent intent id, so
the audit trail reconstructs one decision from N executions.

**Execution quality is measured and stored**, not asserted: arrival price, achieved VWAP,
slippage versus arrival, and versus a consolidated reference. Investors and regulators can both
ask "was this well executed?" and get an answer from data.

## 5. Reconciliation with the ledger

Every external fill follows the same discipline the deposit pipeline already uses:

```
Venue fill report
  → idempotent on (venueKey, venueExecutionId)
  → matched to an internal order intent
  → ledger posting (pool or user wallet ↔ asset delivered/received, fees)
  → position service update
  → NAV engine revaluation  (managed strategies)
```

Unmatched in either direction is an incident with a `RECONCILIATION_MISMATCH` risk event:

- **Venue reports a fill the platform has no intent for** — either a compromised API key or a
  venue bug. Trading on that venue halts pending review.
- **Platform believes in a fill the venue does not report** — the ledger has credited something
  that did not happen. This is the severe direction.

Venue balances are reconciled against the ledger's view of pool assets on the same schedule as
on-chain custody, for the same reason: internal consistency is not evidence that the assets
exist.

## 6. Sandbox versus production

Development and sandbox run against venue **testnets and paper endpoints**, and the platform
labels this everywhere it is visible — a sandbox fill is never presented as a real one. The
`PLATFORM_MODE=live` gate already refuses to boot without a compliance attestation; venue
adapters extend it: a live venue adapter cannot be registered in sandbox mode, and a paper
adapter cannot be registered in live mode. Mixing those two is how a platform accidentally shows
someone a fill that never happened.
