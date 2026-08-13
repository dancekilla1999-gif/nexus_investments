'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Single source of truth for "is this route protected" — every page under app/(app) renders
 * inside this once, in the shared layout, instead of each page re-implementing its own
 * redirect check (docs/08-ui-ux-architecture.md — one pattern, not five slightly different
 * copies of it).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { hydrated, accessToken } = useAuthStore();

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
