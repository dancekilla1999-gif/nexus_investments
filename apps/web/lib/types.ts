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
