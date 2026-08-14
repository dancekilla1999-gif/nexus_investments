import { useAuthStore } from './auth-store';
import { clearStoredRefreshToken, getStoredRefreshToken, storeRefreshToken } from './session';
import {
  AcceptanceStatus,
  ApiErrorBody,
  DepositAddress,
  DepositRecord,
  InvestmentStrategySummary,
  Device,
  LoginResponse,
  Profile,
  PublicUser,
  RiskDisclosureAgreement,
  TokensResponse,
  TransferResult,
  UpdateProfileInput,
  WalletAsset,
  WalletBalance,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && getStoredRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const err = body as ApiErrorBody | undefined;
    throw new ApiError(
      err?.error?.code ?? 'UNKNOWN_ERROR',
      err?.error?.message ?? 'Something went wrong.',
      res.status,
      err?.error?.details,
    );
  }

  return body as T;
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;
    try {
      const tokens = await request<TokensResponse>(
        '/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        false,
      );
      storeRefreshToken(tokens.refreshToken);
      const me = await request<PublicUser>(
        '/users/me',
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        false,
      ).catch(() => null);
      useAuthStore.getState().setSession(tokens.accessToken, me ?? useAuthStore.getState().user!);
      return true;
    } catch {
      clearStoredRefreshToken();
      useAuthStore.getState().clear();
      return false;
    }
  })();

  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

export const api = {
  register: (input: { email: string; password: string; firstName?: string; lastName?: string; referralCode?: string }) =>
    request<TokensResponse & { user: PublicUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  verifyLogin2fa: (input: { loginTicket: string; code: string }) =>
    request<TokensResponse & { user: PublicUser }>('/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  getMe: () => request<PublicUser>('/users/me'),

  updateProfile: (input: UpdateProfileInput) =>
    request<Profile>('/users/me', { method: 'PATCH', body: JSON.stringify(input) }),

  listDevices: () => request<Device[]>('/users/me/devices'),

  revokeDevice: (deviceId: string) => request<void>(`/users/me/devices/${deviceId}`, { method: 'DELETE' }),

  enroll2fa: () => request<{ secret: string; otpauthUrl: string }>('/auth/2fa/enroll', { method: 'POST' }),

  confirm2fa: (code: string) =>
    request<{ backupCodes: string[] }>('/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  disable2fa: (code: string) =>
    request<void>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }),

  getCurrentRiskDisclosureAgreement: () =>
    request<RiskDisclosureAgreement>('/legal/risk-disclosure/current'),

  getRiskDisclosureStatus: () => request<AcceptanceStatus>('/legal/risk-disclosure/status'),

  acceptRiskDisclosureAgreement: () =>
    request<AcceptanceStatus>('/legal/risk-disclosure/accept', { method: 'POST' }),

  getWalletBalances: () => request<WalletBalance[]>('/wallet/balances'),

  getWalletAssets: () => request<WalletAsset[]>('/wallet/assets'),

  transferInternal: (input: { from: string; to: string; assetId: string; amount: string }) =>
    request<TransferResult>('/wallet/transfers', { method: 'POST', body: JSON.stringify(input) }),

  sandboxFaucet: (input: { assetId: string; amount: string }) =>
    request<TransferResult>('/wallet/sandbox/faucet', { method: 'POST', body: JSON.stringify(input) }),

  /** Chains this deployment can actually watch — not every chain in the database. */
  getDepositableChains: () => request<string[]>('/wallet/deposits/chains'),

  /** Idempotent: returns the user's existing address for the chain if one was already issued. */
  getDepositAddress: (chainKey: string) =>
    request<DepositAddress>(`/wallet/deposits/address/${chainKey}`, { method: 'POST' }),

  listDeposits: () => request<DepositRecord[]>('/wallet/deposits'),

  listInvestmentStrategies: () =>
    request<InvestmentStrategySummary[]>('/investments/strategies'),

  getInvestmentStrategy: (slug: string) =>
    request<InvestmentStrategySummary>(`/investments/strategies/${slug}`),

  refreshAccessToken,
};

export { API_URL };
