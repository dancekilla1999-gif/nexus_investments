'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { getStoredRefreshToken } from '@/lib/session';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    async function hydrate() {
      if (getStoredRefreshToken()) {
        await api.refreshAccessToken();
      }
      setHydrated(true);
    }
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
