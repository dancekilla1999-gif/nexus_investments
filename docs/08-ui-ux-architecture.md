# UI/UX Architecture

## 1. Design language

**Premium institutional fintech.** Dark-first, low-chroma neutral base, one restrained accent
used sparingly for calls-to-action and directional data (never both green/red *and* the brand
accent competing for attention). Generous whitespace at the marketing layer, dense
information-forward layout in the terminal/dashboard layer — different information density is
appropriate for different screens, and we design for that explicitly rather than using one
grid everywhere.

Not a themed clone of Binance/Bybit/Coinbase/TradingView — own type scale, own spacing scale,
own component library (`packages/contracts` types + `apps/web/components/ui`, built on
Radix primitives + Tailwind, not a pasted shadcn theme). Charts use `lightweight-charts`
(Apache-2.0, TradingView's own open-source charting lib — **not** a redistribution of their
proprietary product) so candlestick/volume rendering is professional-grade without licensing
or trademark risk.

## 2. Trust signals (specific to a custodial fintech product)

- Landing page states, above the fold: what the platform is, where funds are custodied
  (hot/cold split, plain language link to `06-blockchain-architecture.md`'s summary), which
  markets are supported, and — critically — a clearly labeled **Sandbox/Testnet** badge
  wherever `PLATFORM_MODE=sandbox` (see `02-system-architecture.md §4`), so nobody mistakes a
  pre-launch environment for a live money-handling one.
- No dark patterns: fees are shown before confirmation, not after; withdrawal risk holds are
  explained, not hidden; every irreversible action (withdrawal, API key creation, 2FA
  disable) gets a distinct, non-generic confirmation step.

## 3. Information architecture (screen inventory)

Matches PRD §2 exactly, grouped by access level:

**Public:** Landing, Register, Login, 2FA challenge.
**Onboarding (authenticated, pre-KYC or mid-KYC):** KYC/AML flow.
**Core app (authenticated):** Dashboard, Wallet, Deposit, Withdraw, Internal Transfer, Spot
Trading, Trading Terminal, P2P, Markets, AI Signals, Trading Signals, Portfolio, Orders,
Transactions, Subscriptions, News & Macro, Market Scanner, Coin Research, Notifications,
Referral System, Security Center, Profile, Support Center.
**Privileged (RBAC-gated):** Admin Panel, Risk Management Panel.

## 4. Dashboard composition (MVP1 shell → filled in by later milestones)

```
┌───────────────────────────────────────────────────────────────────┐
│ Total Portfolio          24H P&L         Available   Trading       │
├───────────────────────────────────────────────────────────────────┤
│ Open Orders    │ Active Signals   │ Market Overview │ Top Opportunities │
├───────────────────────────────────────────────────────────────────┤
│ Market Sentiment / Fear & Greed  │  Macro Calendar   │  Latest News │
├───────────────────────────────────────────────────────────────────┤
│ Portfolio Risk                    │  AI Assistant panel             │
└───────────────────────────────────────────────────────────────────┘
```
MVP1 ships this layout with real auth/profile data and **explicit empty/"coming in
MVP-N" states** for every widget whose backing module doesn't exist yet — never fabricated
numbers standing in for real ones (PRD §32/36, "no fake fintech"). Each empty state names the
milestone that fills it, so the product's real build status is visible in the product itself.

## 5. Component system

- `packages/contracts` — shared DTO/zod types (frontend never hand-writes a shape the backend
  disagrees with).
- `apps/web/components/ui` — primitive layer (Button, Input, Card, Dialog, Tabs, Table, Badge,
  Skeleton) — Radix + Tailwind, fully theофeable via CSS variables (light/dark tokens defined
  once).
- `apps/web/components/finance` — domain components (BalanceCard, AssetIcon, DirectionBadge,
  ConfidenceMeter, RiskBadge, PnLValue — color rules for gains/losses centralized here so
  green/red usage is consistent everywhere).
- `apps/web/components/charts` — candlestick/line/area chart wrappers around
  `lightweight-charts`.

## 6. Accessibility & responsiveness

- WCAG 2.1 AA color contrast targets for both themes (validated, not eyeballed).
- Keyboard navigable trading terminal (order entry must not require a mouse).
- Mobile-responsive layouts for every screen in §3; the trading terminal degrades to a
  simplified single-column layout below `lg` breakpoint rather than being unusable.

## 7. Copy standards

- No superlative/guarantee language near financial outcomes (`07-ai-signal-architecture.md
  §10`).
- Numbers are always shown with units and, for crypto amounts, appropriate precision per asset
  (not a blanket 2-decimal format).
- Errors use the API's `error.code` → a maintained human-readable copy table
  (`apps/web/lib/errors.ts`), never a raw stack trace or backend message shown to the user.

## 8. Mobile (future)

`packages/contracts` and the REST/WebSocket API are the entire integration surface a React
Native (Expo) app would need — no web-only backend logic exists, by the API-first principle in
`04-api-architecture.md`. Not built in this repository yet; sequenced after MVP6 in
`09-roadmap.md` once the core trading/wallet APIs are stable.
