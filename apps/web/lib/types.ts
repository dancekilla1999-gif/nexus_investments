/**
 * MVP1 request/response shapes, hand-mirrored from apps/api/src/auth and apps/api/src/users.
 *
 * docs/04-api-architecture.md §2 designs a shared `packages/contracts` workspace so these
 * types are generated from the API's OpenAPI spec and imported by both apps — not hand
 * duplicated. That codegen step is intentionally deferred until more than one module exists
 * to generate from; duplicating a handful of MVP1 types here is a documented, honest
 * simplification, not the intended end state.
 */

export type UserRole = 'USER' | 'SUPPORT' | 'COMPLIANCE' | 'RISK_OPS' | 'ADMIN' | 'SUPERADMIN';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'CLOSED';

export interface Profile {
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  preferredCurrency: string;
  timezone: string;
  avatarUrl?: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  totpEnabled: boolean;
  withdrawalWhitelistEnabled: boolean;
  referralCode: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  profile?: Profile;
}

export interface Device {
  id: string;
  label: string | null;
  userAgent: string | null;
  ip: string | null;
  trusted: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  country?: string;
  preferredCurrency?: string;
  timezone?: string;
  antiPhishingCode?: string;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
}

export type LoginResponse =
  | { twoFactorRequired: true; loginTicket: string }
  | (TokensResponse & { user: PublicUser });

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface RiskDisclosureAgreement {
  id: string;
  version: number;
  title: string;
  bodyMarkdown: string;
  effectiveAt: string;
}

export interface AcceptanceStatus {
  accepted: boolean;
  agreementVersion: number;
  acceptedAt: string | null;
}

export type LedgerBucket = 'AVAILABLE' | 'TRADING' | 'LOCKED' | 'FUNDING' | 'BONUS' | 'PENDING';

export interface WalletBalance {
  assetId: string;
  assetSymbol: string;
  chainKey: string;
  type: LedgerBucket;
  /** Always a decimal string, never a number — an 18-decimal value has no exact float64. */
  amount: string;
}

export interface WalletAsset {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  chainKey: string;
  chainName: string;
  isTestnet: boolean;
}

export interface TransferResult {
  transactionId: string;
  balances: WalletBalance[];
}

export interface DepositAddress {
  chainKey: string;
  chainName: string;
  /**
   * Derived watch-only from an account-level extended public key. No private key for this
   * address exists in any configuration the API can read — see docs/06 §4.
   */
  address: string;
  confirmationsRequired: number;
  isTestnet: boolean;
  /**
   * Symbols a deposit to this address can actually be credited in. Comes from the API rather
   * than being filtered client-side from the asset list: an asset can exist on a chain and
   * still be undetectable by the scanner (a token row with no contract address), and telling a
   * user it is supported would invite them to send funds nothing is watching for.
   */
  supportedAssets: string[];
}

export type DepositStatus =
  | 'DETECTED'
  | 'PENDING_CONFIRMATION'
  | 'CREDITED'
  | 'FAILED'
  | 'ORPHANED';

export interface DepositRecord {
  id: string;
  chainKey: string;
  assetSymbol: string;
  /** Decimal string, as everywhere money is represented. */
  amount: string;
  status: DepositStatus;
  confirmations: number;
  confirmationsRequired: number;
  txHash: string;
  explorerUrl: string | null;
  detectedAt: string;
  creditedAt: string | null;
}

// ── Investment management (docs/12) ──

export type StrategyStatus =
  | 'DRAFT'
  | 'BACKTESTED'
  | 'OPEN'
  | 'SOFT_CLOSED'
  | 'PAUSED'
  | 'WINDING_DOWN'
  | 'CLOSED';

export type DealingFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface InvestmentStrategySummary {
  slug: string;
  name: string;
  description: string;
  thesis: string | null;
  status: StrategyStatus;
  baseAssetSymbol: string;

  /** Terms an investor must see before an amount field exists (docs/12 §3). */
  minimumInvestment: string;
  maximumInvestment: string | null;
  lockupDays: number;
  redemptionNoticeDays: number;
  dealingFrequency: DealingFrequency;

  /** Basis points, from the API — never hardcoded in the frontend. */
  mgmtFeeBps: number;
  perfFeeBps: number;
  maxDrawdownBps: number;
  benchmarkSymbol: string | null;

  /**
   * Null until the NAV engine has struck a snapshot (MVP15). Null renders as "no track record
   * yet"; a zero would read as a real measurement of an empty pool.
   */
  aum: string | null;
  navPerUnit: string | null;
  navStruckAt: string | null;
  investorCount: number;
  performance: null;
}
