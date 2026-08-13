/**
 * Refresh-token persistence for MVP1.
 *
 * Known simplification, documented rather than hidden: the refresh token is kept in
 * localStorage so a page reload doesn't force a re-login. A hardened production build should
 * move this to an httpOnly, Secure, SameSite cookie set by the API directly — tracked in
 * docs/09-roadmap.md §MVP10 (production hardening). The *access* token is never persisted;
 * it lives only in memory (see auth-store.ts) and expires in minutes even if leaked.
 */
const REFRESH_TOKEN_KEY = 'nexus.refreshToken';

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearStoredRefreshToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
