# Blockchain Architecture

## 1. Blockchain Abstraction Layer (BAL)

```
Application (wallet module)
        │
        ▼
  BlockchainAdapter interface   ← every chain implements this contract, nothing else
  (apps/api/src/blockchain/adapter.interface.ts)
        │
   ┌────┼─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
   ▼    ▼         ▼         ▼         ▼         ▼         ▼         ▼
 ETH  Arbitrum   Base     BNB     Polygon   Solana    TRON     Bitcoin
(viem) (viem)   (viem)   (viem)   (viem)   (web3.js) (tronweb) (bitcoinjs-lib)
```

`BlockchainAdapter` contract (see code for the exact TypeScript interface):

```
generateDepositAddress(userId, accountIndex) -> Address
getBalance(address) -> Amount
getConfirmations(txHash) -> number
estimateFee(tx) -> FeeEstimate
buildTransaction(from, to, amount, asset) -> UnsignedTx
broadcastTransaction(signedTx) -> TxHash
watchAddress(address, onDeposit) -> Subscription   // poll or push, adapter's choice
getNetworkStatus() -> { healthy, blockHeight, congestion }
```

EVM chains (Ethereum, Arbitrum, Base, BNB Chain, Polygon) share one `EvmAdapter`
parameterized by chain ID + RPC URL + confirmation-depth policy, so adding "the next EVM
chain" is a config row, not new code. Solana, TRON, and Bitcoin get their own adapters because
their address derivation, fee model, and transaction construction are genuinely different.

Adding a chain that isn't EVM/Solana/TRON/Bitcoin-shaped: implement `BlockchainAdapter` once,
register it in `apps/api/src/blockchain/registry.ts`, add a `chains` row. No other module
changes — the `wallet` and `ledger` modules only ever talk to the interface.

## 2. Deposit flow

```
1. User requests a deposit address for (chainId, assetId)
2. wallet module asks blockchain module for a deterministic address
   (HD derivation: one xpub per chain per custody tier, address = derive(xpub, userAccountIndex))
3. blockchain module's chain watcher (BullMQ repeating job, or provider webhook where available)
   detects an incoming transfer to a known address
4. Once required confirmations are reached (chain-specific policy, e.g. 12 for ETH-family,
   1-2 for fast-finality chains, more for BTC) → wallet module emits a "deposit confirmed" event
5. ledger module credits the user's `pending` balance immediately on first-seen (visible,
   non-spendable), then moves pending → available on confirmation, via a ledger transaction
   keyed by (chainId, txHash, logIndex) for idempotency (03-database-architecture.md §3)
```

## 3. Withdrawal flow

```
User Request → risk module scoring → aml module screening → (auto-approve under threshold |
queued for admin approval) → wallet module builds unsigned tx → SigningProvider signs →
blockchain module broadcasts → chain watcher confirms → ledger module finalizes the withdrawal
ledger transaction → user notified
```
Funds are moved to `locked` the moment the withdrawal is requested (not on approval) so the
same balance can never be double-spent by a second concurrent withdrawal or trade — enforced
by a DB-level constraint plus the ledger transaction itself, not just application logic.

## 4. Custody model: hot / cold / signing

- **Hot wallet:** holds a small, policy-capped operational float per chain, sufficient for
  same-day withdrawal volume. Its signing key(s) are the only ones ever reachable by the
  running application process, and even then only through the `SigningProvider` interface —
  never held in plaintext in application memory/config beyond the scope of a single sign
  operation in the reference/dev implementation, and never at all in a production-grade
  implementation (see below).
- **Cold / custody wallet:** holds the majority of assets. No online signing capability by
  design — moving funds hot→cold or cold→hot is a manual/quorum operational runbook, not an
  API call.
- **Production signing:** the `SigningProvider` interface is implemented in production by one
  of:
  - **MPC (multi-party computation)** threshold signing (e.g. Fireblocks, Copper, Qredo, or a
    self-hosted `tss-lib`/`multi-party-ecdsa`-based signer) — no single party ever holds a
    complete private key.
  - **HSM-backed signing** (cloud HSM or on-prem, e.g. AWS CloudHSM / YubiHSM) with policy
    engine approval gating each signature.
  This repository ships a **development-only** local-keystore `SigningProvider` (keys
  encrypted at rest with a KMS-wrapped data key, used only in `development`/`staging` sandbox
  mode) and refuses to boot with `PLATFORM_MODE=live` unless a non-dev `SigningProvider` is
  configured — enforced by `apps/api/src/config/platform-mode.guard.ts`
  (`05-security-architecture.md §3`). **Private keys are never stored in the application
  database, ever, under any configuration.**

## 5. Balance reconciliation

A scheduled job (`blockchain` module) periodically compares each custody address's on-chain
balance against the sum of `ledger_entries` attributable to it. A mismatch beyond a small,
chain-specific dust tolerance raises a `risk_event` of type `RECONCILIATION_MISMATCH` and pages
on-call — this is the concrete implementation of PRD §1's "ledger is truth, chain is verified
against it," not just a slogan.

## 6. Supported networks (v1)

Ethereum, Arbitrum, Base, BNB Chain, Polygon, Solana, TRON, Bitcoin — per PRD. Each is a
`chains` row + adapter registration; see `apps/api/prisma/seed.ts` for the seeded set.

## 7. Gas/fee handling

`estimateFee` is called before every withdrawal is quoted to the user (and re-checked at
broadcast time, since fees move); network fee is charged to the user per the Fee Engine
(`09-roadmap.md §MVP8`/Admin Panel-configurable), never hardcoded in the frontend
(`05-security-architecture.md` "no hardcoded fees" principle, PRD §20).

## 8. Third-party chain data providers (to configure per environment)

| Need | Suggested provider | Why | Free tier | Get a key |
|---|---|---|---|---|
| EVM RPC | Alchemy or Infura | reliable archive/websocket RPC, generous free tier | Yes (both) | alchemy.com / infura.io |
| Solana RPC | QuickNode or Helius | Solana-specific reliability at scale | Yes | quicknode.com / helius.dev |
| TRON | TronGrid | official-adjacent, free | Yes | trongrid.io |
| Bitcoin | self-hosted `bitcoind` (recommended for custody) or Blockstream/mempool.space API for read-only lookups | custody-grade nodes should be self-hosted, not third-party for signing-adjacent data | mempool.space free for reads | n/a (self-hosted) or mempool.space |

All are accessed through the `BlockchainAdapter` interface — swapping a provider is a config
change, not a code change, and every key is read from the secrets manager
(`05-security-architecture.md §3`), never hardcoded.

## 9. On a proprietary chain (explicitly deferred)

PRD §17 asks us not to build a chain "for marketing." We agree. If, later, real fee/latency
economics justify an appchain or rollup (e.g. dedicated block space for the order book), that
gets its **own** architecture document with a cost/benefit analysis (sequencer
centralization risk, bridge security model, who audits it) before any code — it does not get
bootstrapped inside this document.
