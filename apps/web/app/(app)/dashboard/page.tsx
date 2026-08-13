'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ComingSoonWidget } from '@/components/finance/coming-soon-widget';
import { StatCardSkeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.getMe });

  const displayName = me?.profile?.firstName ?? user?.email?.split('@')[0];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back{displayName ? `, ${displayName}` : ''}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <span>{user?.email ?? me?.email}</span>
          {(me?.status ?? user?.status) === 'PENDING_VERIFICATION' && (
            <Badge tone="warning">Email unverified</Badge>
          )}
        </div>
      </header>

      {/* Top summary row — Total Portfolio / 24H P&L / Available / Trading */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : [
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

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
