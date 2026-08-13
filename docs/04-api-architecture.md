# API Architecture

## 1. Principles

- **API-first.** `apps/web` is just one client of `apps/api`. Every capability the web app
  uses is a documented, versioned API endpoint — nothing is web-only server logic.
- **REST for commands/queries, WebSocket for streams, webhooks for external → platform
  events.** We do not force streaming data through REST polling, and we do not force
  request/response commands through a socket.
- **OpenAPI is generated from code** (`@nestjs/swagger` decorators on DTOs/controllers), not
  hand-maintained, so it cannot drift from the implementation. Served at `/api/docs` in every
  non-production environment, and behind auth in production.

## 2. Versioning & stability

- URI-versioned: `/api/v1/...`. A breaking change ships as `/api/v2/...` alongside `v1` for a
  published deprecation window — never a silent breaking change to `v1`.
- DTOs live in `packages/contracts` and are imported by both `apps/api` (as the request/response
  shape) and `apps/web` (as the fetch client's types), so frontend/backend cannot silently
  drift either.

## 3. AuthN/AuthZ on every request

- `Authorization: Bearer <access_jwt>` — short-lived (15 min), signed, carries `sub`, `roles`,
  `sessionId`. Refresh via rotating opaque refresh token (httpOnly cookie for web, secure
  storage for future mobile), single-use, replay-detected (see `05-security-architecture.md`).
- `RolesGuard` + `PermissionsGuard` enforce RBAC per-route (`@Roles('admin')`,
  `@Permissions('withdrawals:approve')`).
- Step-up auth: routes tagged `@RequiresStepUp()` (withdrawal creation, security-setting
  changes, API key creation) require a *recent* 2FA/re-auth assertion, not just a valid
  session — enforced by `StepUpGuard` checking `stepUpVerifiedAt` in the session record.
- Idempotency: mutating financial endpoints require an `Idempotency-Key` header; the gateway
  layer stores `(key, route, userId) → response` in Redis (24h TTL) and short-circuits repeats.
- Rate limiting: `@nestjs/throttler` with Redis storage, tiered by route sensitivity
  (auth endpoints strictest, market-data reads most permissive) and by subscription tier for
  API-key traffic.

## 4. Representative endpoint groups (v1)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/2fa/enroll
POST   /api/v1/auth/2fa/verify
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/devices
DELETE /api/v1/users/me/devices/:id

# MVP2+ (designed, not yet implemented in this repo — see 09-roadmap.md)
GET    /api/v1/wallet/balances
POST   /api/v1/wallet/deposit-address           {chainId, assetId}
GET    /api/v1/wallet/transactions
POST   /api/v1/wallet/withdrawals
GET    /api/v1/wallet/withdrawals/:id
POST   /api/v1/transfers/internal               {from, to, assetId, amount}

GET    /api/v1/markets
GET    /api/v1/markets/:symbol/orderbook
GET    /api/v1/markets/:symbol/candles
POST   /api/v1/orders
DELETE /api/v1/orders/:id
GET    /api/v1/orders
GET    /api/v1/trades

GET    /api/v1/p2p/ads
POST   /api/v1/p2p/ads
POST   /api/v1/p2p/orders
POST   /api/v1/p2p/orders/:id/dispute

GET    /api/v1/signals
GET    /api/v1/signals/:id
GET    /api/v1/signals/performance

POST   /api/v1/ai/assistant/query
GET    /api/v1/news
GET    /api/v1/macro/calendar

GET    /api/v1/subscriptions/plans
POST   /api/v1/subscriptions

# Admin (separate RBAC surface, same API)
GET    /api/v1/admin/users
GET    /api/v1/admin/withdrawals/pending
POST   /api/v1/admin/withdrawals/:id/approve
GET    /api/v1/admin/audit-logs
```

## 5. WebSocket channels (v1, designed)

```
/ws/market/:symbol/trades
/ws/market/:symbol/orderbook
/ws/user/orders           (authenticated, user-scoped)
/ws/user/balances         (authenticated, user-scoped)
/ws/user/notifications    (authenticated, user-scoped)
/ws/signals               (authenticated, entitlement-scoped by subscription tier)
```
Backed by a Redis pub/sub adapter (`@socket.io/redis-adapter` equivalent for
`@nestjs/websockets`) so multiple API instances share one logical socket namespace.

## 6. Webhooks (inbound)

- `POST /webhooks/kyc/:provider` — KYC provider result callback (MVP3)
- `POST /webhooks/chain/:chainId` — chain-indexer push notifications, where the provider
  supports push (else we poll — see `06-blockchain-architecture.md`)
- All inbound webhooks are HMAC-signature-verified against a per-provider secret from the
  secrets manager, and are idempotent by the provider's event ID.

## 7. Webhooks (outbound, future — API-first for bots)

Once `api_keys` (already in the schema) support user-issued keys with scoped permissions,
users can register outbound webhook URLs for order fills/signal events, and connect their own
trading bots read-only (market data, own orders) or trade-enabled (scoped, rate-limited,
revocable key) — this is designed into the `api_keys` table now specifically so it does not
require a schema change later.

## 8. Error contract

Every error response follows one shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Human-readable, safe to display",
    "requestId": "req_...",
    "details": { }
  }
}
```
`code` is a stable machine-readable enum (`packages/contracts/errors.ts`), never a raw
exception message — so the frontend can branch on it and we never leak internals.

## 9. Documentation

`apps/api` mounts Swagger UI at `/api/docs` (non-prod) and exports the raw spec at
`/api/docs-json`, consumed by `packages/contracts`' codegen script to keep client types in
sync — see `apps/api/README.md`.
