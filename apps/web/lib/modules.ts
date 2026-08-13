import {
  Wallet,
  LineChart,
  Users,
  TrendingUp,
  Sparkles,
  PieChart,
  ListOrdered,
  Receipt,
  CreditCard,
  Landmark,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleInfo {
  title: string;
  milestone: string;
  icon: LucideIcon;
  tagline: string;
  bullets: string[];
}

/**
 * Copy for the honest "ships in MVP-N" full-page states — mirrors docs/09-roadmap.md so the
 * product itself stays truthful about what's built vs. designed (docs/01-PRD.md principle #2).
 */
export const modules: Record<string, ModuleInfo> = {
  wallet: {
    title: 'Wallet',
    milestone: 'MVP2',
    icon: Wallet,
    tagline: 'Multi-chain deposit addresses backed by a double-entry internal ledger.',
    bullets: [
      'Deposit addresses for Ethereum, Arbitrum, Base, BNB Chain, Polygon, Solana, TRON, and Bitcoin',
      'Available / Trading / Locked / Funding / Bonus / Pending balance buckets',
      'Blockchain confirmations tracked independently of ledger crediting',
      'Internal transfers between Wallet, Trading, and P2P — all through the ledger, never a raw balance edit',
    ],
  },
  trading: {
    title: 'Trading Terminal',
    milestone: 'MVP4',
    icon: LineChart,
    tagline: 'A real order book and matching engine — not a price ticker with buy/sell buttons.',
    bullets: [
      'Market, limit, stop, stop-limit, and OCO order types',
      'Live order book, trade tape, and candlestick charts',
      'Idempotent order placement — safe under retries and race conditions',
      'Spot only at launch; margin/futures require a dedicated risk engine first (docs/01-PRD.md §5)',
    ],
  },
  p2p: {
    title: 'P2P',
    milestone: 'MVP5',
    icon: Users,
    tagline: 'Peer-to-peer trading with escrow, reputation, and dispute resolution.',
    bullets: [
      'Post buy/sell ads with fixed or floating pricing and payment method preferences',
      'Funds move to escrow the moment an order is accepted — no unilateral release',
      'Seller/buyer reputation and trade history',
      'Admin-mediated dispute resolution, fully audit-logged',
    ],
  },
  markets: {
    title: 'Markets',
    milestone: 'MVP4',
    icon: TrendingUp,
    tagline: 'A dynamic Top Markets Engine — not a hardcoded pair list.',
    bullets: [
      'Ranked by live volume, market cap, and liquidity depth',
      'Refreshed on a schedule, not manually curated',
      'Feeds the AI Market Scanner once MVP6 (Signal Engine) ships',
    ],
  },
  signals: {
    title: 'AI Signals',
    milestone: 'MVP6',
    icon: Sparkles,
    tagline: 'Explainable, confidence-scored setups — never "guaranteed."',
    bullets: [
      '100+ indicator library across trend, momentum, volatility, volume, and structure',
      'Entry zone, stop loss, take-profit levels, risk/reward, and confidence score on every signal',
      'Real, immutable win-rate and R/R statistics — computed from outcomes, never hand-edited',
      'Macro and news context reduces confidence on technically clean setups when a major event is near',
    ],
  },
  portfolio: {
    title: 'Portfolio',
    milestone: 'MVP2',
    icon: PieChart,
    tagline: 'Holdings, allocation, and — once MVP7 ships — AI-assisted risk analysis.',
    bullets: [
      'Cross-asset balance view sourced from the ledger, not the raw chain',
      'Concentration, correlation, and drawdown analysis (MVP7 AI Portfolio Assistant)',
      'Never a personalized return guarantee — risk framing only',
    ],
  },
  orders: {
    title: 'Orders',
    milestone: 'MVP4',
    icon: ListOrdered,
    tagline: 'Full order history and lifecycle — open, partially filled, filled, cancelled.',
    bullets: ['Real-time order status via WebSocket', 'Filter by market, side, type, and status'],
  },
  transactions: {
    title: 'Transactions',
    milestone: 'MVP2',
    icon: Receipt,
    tagline: 'Every deposit, withdrawal, trade, and transfer — one immutable history.',
    bullets: [
      'Every entry traces back to a ledger transaction with a unique idempotency key',
      'Exportable, filterable by asset, type, and date range',
    ],
  },
  subscriptions: {
    title: 'Subscriptions',
    milestone: 'MVP8',
    icon: CreditCard,
    tagline: 'Free / Pro / Elite signal tiers with server-enforced entitlements.',
    bullets: [
      'Plan pricing and features are Admin Panel-configurable, never hardcoded in the frontend',
      'Entitlement checks run server-side on every gated endpoint',
      'Referral commissions post through the same ledger as everything else',
    ],
  },
  managedAccounts: {
    title: 'Managed Accounts',
    milestone: 'MVP11',
    icon: Landmark,
    tagline: 'Discretionary investing — a manager or validated strategy trades on your behalf.',
    bullets: [
      'Your capital stays in your own segregated sub-account — never pooled with another investor’s',
      'A hard, platform-enforced ceiling: no account can be configured to risk more than 10% of its capital',
      'No strategy trades real capital without a passing historical backtest and a live paper-trading observation window first',
      'Requires its own jurisdiction-specific legal review for discretionary trading — separate from, and stricter than, the platform’s base custodial review',
    ],
  },
};
