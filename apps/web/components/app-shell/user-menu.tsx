'use client';

import { ChevronDown, LogOut, Shield, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { clearStoredRefreshToken, getStoredRefreshToken } from '@/lib/session';
import { toast } from '@/lib/toast';

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user, clear } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleLogout() {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    clearStoredRefreshToken();
    clear();
    // A hard navigation, not router.push: clearing the auth store while still mounted under
    // app/(app)/layout.tsx's AuthGuard races its own "no session → /login" redirect against
    // this one ("logout → /"). A full reload sidesteps the race and, as a side effect, wipes
    // any in-memory client state (React Query cache, component state) rather than trusting
    // every consumer to reset itself on logout — the safer default for a session boundary.
    window.location.href = '/';
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:border-ink-muted"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">
          {initials(user.email)}
        </span>
        <span className="hidden max-w-[140px] truncate text-ink-muted sm:inline">{user.email}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 animate-fade-in rounded-xl border border-border bg-surface-raised p-1.5 shadow-lg">
          <div className="border-b border-border px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{user.email}</p>
            <p className="text-xs text-ink-muted">{user.role.toLowerCase()}</p>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink"
          >
            <UserCircle className="h-4 w-4" /> Profile
          </Link>
          <Link
            href="/security"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Shield className="h-4 w-4" /> Security Center
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-negative hover:bg-negative/10"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
