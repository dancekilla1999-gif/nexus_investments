'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ComingSoonWidget } from '@/components/finance/coming-soon-widget';
import { TwoFactorSetup } from '@/components/security/two-factor-setup';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { clearStoredRefreshToken, getStoredRefreshToken } from '@/lib/session';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hydrated, accessToken, user, clear } = useAuthStore();

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hydrated, accessToken, router]);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.getMe,
    enabled: !!accessToken,
  });

  async function handleLogout() {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      await api.logout(refreshToken).catch(() => undefined);
    }
    clearStoredRefreshToken();
    clear();
    router.push('/');
  }

  if (!hydrated || !accessToken) {
    return <main className="mx-auto max-w-6xl px-6 py-16 text-sm text-ink-muted">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted">{user?.email ?? me?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {(me?.status ?? user?.status) === 'PENDING_VERIFICATION' && (
            <Badge tone="warning">Email unverified</Badge>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </header>

      {/* Top summary row — Total Portfolio / 24H P&L / Available / Trading */}
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          ['Total Portfolio', 'MVP2'],
          ['24H P&L', 'MVP4'],
          ['Available Balance', 'MVP2'],
          ['Trading Balance', 'MVP2'],
        ].map(([label, milestone]) => (
          <Card key={label}>
            <div className="text-xs text-ink-muted">{label}</div>
            <div className="mt-2 font-mono text-2xl text-ink-muted">—</div>
            <Badge tone="neutral" className="mt-2">
              {milestone}
            </Badge>
          </Card>
        ))}
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ComingSoonWidget
          title="Open Orders"
          milestone="MVP4"
          description="Spot order management ships with the Trading module."
        />
        <ComingSoonWidget
          title="Active Signals"
          milestone="MVP6"
          description="AI Signal Engine with confidence scores and live performance stats."
        />
        <ComingSoonWidget
          title="Market Overview"
          milestone="MVP4"
          description="Live order book, candles, and trade tape via Market Data Service."
        />
        <ComingSoonWidget
          title="Top Opportunities"
          milestone="MVP6"
          description="Ranked by the dynamic Top Markets / Market Scanner Engine."
        />
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <ComingSoonWidget
          title="Market Sentiment / Fear & Greed"
          milestone="MVP7"
          description="Computed from the News & Macro Engine and on-chain analytics."
        />
        <ComingSoonWidget
          title="Macro Calendar"
          milestone="MVP7"
          description="CPI, NFP, FOMC and other scheduled macro events, tagged by impact."
        />
        <ComingSoonWidget
          title="Latest News"
          milestone="MVP7"
          description="Aggregated, sentiment-tagged crypto news."
        />
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <ComingSoonWidget
          title="Portfolio Risk"
          milestone="MVP7"
          description="AI Portfolio Assistant: concentration, correlation, and drawdown analysis."
        />
        <ComingSoonWidget
          title="AI Assistant"
          milestone="MVP7"
          description="Ask questions grounded in your own portfolio and live platform data."
        />
      </section>

      {/* Security Center preview — this one is real (MVP1) */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <TwoFactorSetup
          enabled={me?.totpEnabled ?? user?.totpEnabled ?? false}
          onEnabled={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
        />
      </Card>
    </main>
  );
}
