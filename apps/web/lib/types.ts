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

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  totpEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface Profile {
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  preferredCurrency: string;
  timezone: string;
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
