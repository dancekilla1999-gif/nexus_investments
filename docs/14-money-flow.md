# 14. Money Flow — investor deposit to real execution and back out

> The complete path, with the actual double-entry postings at every step. If a step is not here,
> it does not exist: there is no other way for value to move.
>
> Legend: `[U]` user-owned · `[P]` pool-owned (investors, pro rata) · `[F]` platform-owned ·
> `[B]` boundary contra-account. Every posting sums to zero per asset.

---

## Step 1 — Deposit (built, MVP2)

Chain → platform. Nothing to do with investing yet; this is the user funding their own wallet.

```
On detection (visible immediately, not yet spendable):
  [B] EXTERNAL              −1,000 USDT
  [U] user.PENDING          +1,000 USDT

At the chain's confirmation depth:
  [U] user.PENDING          −1,000 USDT
  [U] user.AVAILABLE        +1,000 USDT
```

Owner throughout: **the user**. Idempotent on `(chainId, txHash, logIndex)`.

---

## Step 2 — Subscription request (`INVEST`)

The investor picks a strategy, is shown minimum, fees, risk, historical performance, lock-up and
redemption terms **before** entering an amount, accepts the strategy's investment agreement and
risk disclosure, then confirms.

```
  [U] user.AVAILABLE              −15,000 USDT
  [U] user.PENDING_SUBSCRIPTION   +15,000 USDT
```

Owner: **still the user.** Nothing has been invested yet. A subscription cancelled before the
dealing point returns here, in full, with no fee — the money never left them.

---

## Step 3 — Dealing point: units issued

NAV is struck from marks the pool did not choose (§2.2 of `docs/12` — this is what prevents
subscription at a stale price from diluting existing investors).

```
Suppose navPerUnit = 1.2340

  [U] user.PENDING_SUBSCRIPTION   −15,000 USDT
  [P] strategy.POOL_CASH          +15,000 USDT

Unit register (equity side, not an asset movement):
  position.units        += 12,155.5915721232...   (15,000 / 1.2340)
  strategy.totalUnits   += 12,155.5915721232...
  position.costBasis    += 15,000
  position.hwmUnitPrice  = 1.2340   (first subscription)
  position.lockedUntil   = now + lockupDays
```

Owner: **the pool's investors, pro rata by units** — of which this investor is now one. The
platform owns none of it.

**Invariant enforced here and checked continuously:**

```
Σ InvestmentPosition.units  ==  Strategy.totalUnits          (no phantom units)
Σ (units × navPerUnit)      ==  poolNAV                       (equity == assets)
```

---

## Step 4 — The manager trades

The manager decides; the risk engine decides whether the decision is allowed; the router decides
where it executes.

```
Manager intent: LONG BTC 2,000,000 USDT for strategy "AI Top 25"
  → permission   (is this trader assigned to this strategy?)
  → mandate      (is BTC permitted for this strategy?)
  → exposure     (would this breach max asset exposure / concentration?)
  → leverage, drawdown, daily-loss, liquidity, volatility
  → Smart Order Router → venue(s), possibly split
  → fills
```

On each fill:

```
  [P] strategy.POOL_CASH          −500,000 USDT
  [P] strategy.POOL_POSITION      + 7.42... BTC
  [P] strategy.POOL_CASH          −    250 USDT   (venue fee)
  [F] platform.REVENUE            +    250 USDT   ← disclosed execution fee, if any
```

Idempotent on `(venueKey, venueExecutionId)`. Owner of the BTC: **the same investors, in the
same proportions.** A trade changes *what* the pool holds, never *who* holds it.

---

## Step 5 — Mark to market

```
  NO LEDGER POSTING.
```

Unrealised P&L moves no value, so it must not move a ledger balance. It changes the **mark**,
which changes NAV, which changes `navPerUnit`, which changes every investor's value
simultaneously and exactly. The NAV Engine writes an immutable `NavSnapshot` with the price
source recorded — a manager cannot supply a mark, because a manager who can set prices can
author their own performance fee.

```
  poolNAV     = Σ position marks + cash − liabilities
  navPerUnit  = poolNAV / totalUnits          → e.g. 1.2340 → 1.4187
  investor value = units × navPerUnit          → 15,000 → 17,244.71
```

---

## Step 6 — Fees accrue

Accrual is **per investor**, because investors joined at different times and different prices.
Accruals are recorded as immutable `FeeAccrual` rows and reflected in the position; they do not
move assets yet, so they do not disturb anyone else's `navPerUnit`.

```
Daily:
  mgmtAccrual = positionValue × mgmtFeeBps / 10000 / 365
  perfAccrual = max(0, navPerUnit − hwmUnitPrice) × units × perfFeeBps / 10000

Investor sees:
  gross value   units × navPerUnit
  − accrued management fee
  − accrued performance fee
  = net value
```

The investor can open the arithmetic behind each: period, rate, base, HWM, result.

---

## Step 7 — Crystallisation

On the configured schedule (or at redemption), accrued fees are actually paid. The fee is
settled by **cancelling units**, which is what keeps every other investor untouched:

```
  Fee owed: 1,000 USDT, navPerUnit = 1.4187

  [P] strategy.POOL_CASH     −1,000 USDT
  [F] platform.REVENUE       +1,000 USDT     type: FEE_CRYSTALLISATION

  position.units       −= 704.87...   (1,000 / 1.4187)
  strategy.totalUnits  −= 704.87...
  position.hwmUnitPrice = 1.4187      ← ratchets up, never down
  position.accrued*     = 0
```

Check that this is fair: pool assets fall by 1,000 and units fall by 1,000/navPerUnit, so
`navPerUnit` is **unchanged** — the paying investor bears the whole fee, nobody else moves. This
is the only crossing from pool-owned to platform-owned value, its amount comes from the fee
engine rather than from any operator's input, and it is one of a short list of transaction types
a database trigger permits to cross that boundary at all (`docs/12` §1.1).

---

## Step 8 — Redemption

```
Investor requests: redeem 50%
  → lock-up check          (lockedUntil passed?)
  → notice period          (redemptionNoticeDays)
  → next dealing point     (NAV struck independently, as in step 3)
```

At the dealing point, fees crystallise first (step 7), then:

```
  units redeemed        6,077.79...  → value 8,622.35 USDT

  [P] strategy.POOL_CASH     −8,622.35 USDT
  [U] user.AVAILABLE         +8,622.35 USDT     type: REDEMPTION_SETTLEMENT

  position.units       −= 6,077.79...
  strategy.totalUnits  −= 6,077.79...
  position.costBasis   −= 7,500        (proportional return of capital)
```

If the pool lacks free cash, the redemption is queued and the manager is told how much must be
raised — the allocation engine's job (§7 of `docs/12`). Investors are **never** paid out of
platform funds to cover a liquidity gap: that would silently convert a pool shortfall into a
platform loss and hide the real problem.

Owner after: **the user**, back in their own wallet.

---

## Step 9 — Withdrawal to chain (MVP3)

```
  [U] user.AVAILABLE   −8,622.35 USDT
  [U] user.LOCKED      +8,622.35 USDT       locked at request, not at approval

  → risk scoring → AML / sanctions screening → approval (tiered)
  → unsigned tx built → SigningProvider (HSM/MPC) → broadcast
  → confirmations

  [U] user.LOCKED      −8,622.35 USDT
  [B] EXTERNAL         +8,622.35 USDT
```

Funds move to `LOCKED` the moment the withdrawal is *requested*, so the same balance cannot be
spent twice by a concurrent trade or a second withdrawal.

---

## The whole loop

```
   chain ──▶ EXTERNAL ──▶ user.PENDING ──▶ user.AVAILABLE
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                            MODE A: self trading   MODE B: invest
                                    │                     │
                            risk → SOR → venue    user.PENDING_SUBSCRIPTION
                                    │                     │  (dealing point)
                                    │              strategy.POOL  ◀── units issued
                                    │                     │
                                    │            manager → risk → SOR → venue
                                    │                     │
                                    │              NAV ▲ / ▼  (marks, no posting)
                                    │                     │
                                    │              fees accrue per investor
                                    │                     │
                                    │              crystallise → platform.REVENUE
                                    │                     │
                                    │              redemption at dealing point
                                    │                     ▼
                                    └────────────▶ user.AVAILABLE
                                                          │
                                              risk → AML → approval → sign
                                                          ▼
                                            user.LOCKED ──▶ EXTERNAL ──▶ chain
```

## What this design refuses to allow

1. **No path from investor or pool funds to the platform** except `FEE_CRYSTALLISATION` and
   disclosed `TRADING_FEE`, both computed by the fee engine from configured rates, both blocked
   at the database level for any other transaction type.
2. **No operator-entered amounts.** There is no endpoint anywhere that accepts "move X from A to
   B" from an administrator. Value moves only as the consequence of a typed event: a deposit, a
   fill, a fee the schedule produced, a redemption the investor requested.
3. **No manual NAV, no manual HWM.** Both are written by their engines alone. Lowering an HWM is
   indistinguishable from charging for the same performance twice.
4. **No deletable audit trail.** Append-only by database trigger, so it survives an application
   compromise and a `SUPER_ADMIN`.
5. **No paying redemptions from platform money**, which would disguise a pool shortfall.
