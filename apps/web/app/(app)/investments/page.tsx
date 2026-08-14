'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Landmark, Lock, ShieldAlert, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import { InvestmentStrategySummary } from '@/lib/types';

/** Basis points → a percentage string, without ever touching a float on a money figure. */
function bps(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

export default function InvestmentsPage() {
  const { data: strategies, isLoading } = useQuery({
    queryKey: ['investment-strategies'],
    queryFn: api.listInvestmentStrategies,
  });

  return (
    <div className="space-y-6 pb-12">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-accent">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Investments</h1>
          <p className="text-sm text-ink-muted">
            Place capital with a managed strategy instead of trading it yourself.
          </p>
        </div>
      </header>

      {/* Stated before any product, not buried in a product's fine print. */}
      <Card className="border-warning/30">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-xs text-ink-muted">
            <p className="font-medium text-ink">Investing here means risking capital you can lose.</p>
            <p className="mt-1">
              Returns shown anywhere on this platform are historical. They describe what a strategy
              did, not what it will do. No result is promised, and every strategy can lose money —
              including all of it. You will be asked to read and accept a risk disclosure before any
              subscription is possible.
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-3 h-16 w-full" />
              <Skeleton className="mt-4 h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : !strategies || strategies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No strategies are open yet</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-muted">
            A strategy only appears here once it has a passing backtest on historical data and has
            been opened for subscription. Nothing is listed before it can actually be invested in.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((strategy) => (
            <StrategyCard key={strategy.slug} strategy={strategy} />
          ))}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium">Subscribing</span>
          </div>
          <Badge tone="neutral">MVP13</Badge>
        </div>
        <p className="text-sm text-ink-muted">
          The accounting a subscription posts through is built and tested — units, pooled custody,
          and the boundary that keeps pool assets structurally separate from platform money. What
          ships next is the dealing-point machinery that issues units at an independently struck
          NAV, so that subscribing at a stale price cannot dilute anyone.
        </p>
      </Card>
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: InvestmentStrategySummary }) {
  const closed = strategy.status === 'SOFT_CLOSED';

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{strategy.name}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Denominated in {strategy.baseAssetSymbol}
            {strategy.benchmarkSymbol && ` · benchmark ${strategy.benchmarkSymbol}`}
          </p>
        </div>
        {closed ? <Badge tone="neutral">Closed to new capital</Badge> : <Badge tone="positive">Open</Badge>}
      </div>

      <p className="mt-3 text-sm text-ink-muted">{strategy.description}</p>

      {/* Track record. Absent rather than zero-filled — a chart of zeros is a fabricated one. */}
      <div className="mt-4 rounded-xl border border-border bg-surface-raised p-3">
        {strategy.navPerUnit === null ? (
          <p className="text-xs text-ink-muted">
            <span className="text-ink">No track record yet.</span> This strategy has not struck a
            valuation, so there is no performance to show. Its historical backtest is what
            qualified it to open — that is a simulation, not a result.
          </p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <Metric label="AUM">
              <Amount value={strategy.aum ?? '0'} symbol={strategy.baseAssetSymbol} />
            </Metric>
            <Metric label="NAV per unit">
              <Amount value={strategy.navPerUnit} />
            </Metric>
            <Metric label="Investors">{strategy.investorCount}</Metric>
          </div>
        )}
      </div>

      {/* Every term that binds the investor, shown before any amount can be entered. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <Term label="Minimum">
          <Amount value={strategy.minimumInvestment} symbol={strategy.baseAssetSymbol} />
        </Term>
        <Term label="Performance fee">
          {bps(strategy.perfFeeBps)} of profit above your high water mark
        </Term>
        <Term label="Management fee">
          {strategy.mgmtFeeBps === 0 ? 'None — no profit, no fee' : `${bps(strategy.mgmtFeeBps)} a year`}
        </Term>
        <Term label="Max drawdown limit">{bps(strategy.maxDrawdownBps)}</Term>
        <Term label="Lock-up">
          {strategy.lockupDays === 0 ? 'None' : `${strategy.lockupDays} days`}
        </Term>
        <Term label="Redemption notice">
          {strategy.redemptionNoticeDays === 0
            ? 'None'
            : `${strategy.redemptionNoticeDays} days`}
        </Term>
      </dl>

      {strategy.perfFeeBps >= 5000 && (
        // At a 50% share the manager takes half the upside and none of the downside. The
        // drawdown cap is the counterweight, and the two only make sense read together —
        // so they are shown together, at the point of deciding.
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-xs text-ink-muted">
            <span className="font-medium text-ink">
              You keep {bps(10000 - strategy.perfFeeBps)} of the profit; the manager takes{' '}
              {bps(strategy.perfFeeBps)}.
            </span>{' '}
            The manager shares the profit but not the losses, which rewards taking risk. The{' '}
            {bps(strategy.maxDrawdownBps)} drawdown limit is the hard stop that bounds it — it can
            be made stricter, never looser.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-ink-muted">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>
          Subscriptions open in MVP13. Terms above are live from the platform&apos;s fee engine, not
          placeholder copy.
        </span>
      </div>

      <Link
        href={`/investments/${strategy.slug}`}
        className="mt-3 inline-flex items-center text-sm font-medium text-accent hover:underline"
      >
        Full terms and risk disclosure →
      </Link>
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
