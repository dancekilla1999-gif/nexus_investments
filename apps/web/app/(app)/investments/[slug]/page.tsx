'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Landmark, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Amount } from '@/components/finance/amount';
import { MarkdownLite } from '@/components/legal/markdown-lite';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api-client';

function bps(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

/**
 * Full terms for one product.
 *
 * The order on this page is deliberate and is the order docs/12 §3 requires: what it is, what it
 * costs, what binds you, what can go wrong — and only then, eventually, an amount field. A page
 * that leads with a return figure and hides the lock-up below the fold is how people end up in
 * products they did not understand.
 */
export default function StrategyDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const { data: strategy, isLoading, error } = useQuery({
    queryKey: ['investment-strategy', slug],
    queryFn: () => api.getInvestmentStrategy(slug!),
    enabled: Boolean(slug),
    retry: false,
  });

  const { data: agreement } = useQuery({
    queryKey: ['risk-disclosure-agreement'],
    queryFn: api.getCurrentRiskDisclosureAgreement,
  });
  const { data: acceptance } = useQuery({
    queryKey: ['risk-disclosure-status'],
    queryFn: api.getRiskDisclosureStatus,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-12">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-12">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Strategy not found</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-muted">
            {error instanceof ApiError && error.status === 404
              ? 'This strategy either does not exist or is not open for investment.'
              : 'Could not load this strategy.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <BackLink />

      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised text-accent">
          <Landmark className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{strategy.name}</h1>
            {strategy.status === 'SOFT_CLOSED' ? (
              <Badge tone="neutral">Closed to new capital</Badge>
            ) : (
              <Badge tone="positive">Open</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Denominated in {strategy.baseAssetSymbol}
            {strategy.benchmarkSymbol && ` · benchmark ${strategy.benchmarkSymbol}`}
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>What this strategy does</CardTitle>
        </CardHeader>
        <p className="text-sm text-ink-muted">{strategy.description}</p>
        {strategy.thesis && (
          <>
            <h3 className="mt-4 text-sm font-medium">Thesis</h3>
            <p className="mt-1 text-sm text-ink-muted">{strategy.thesis}</p>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Track record</CardTitle>
        </CardHeader>
        {strategy.navPerUnit === null ? (
          <p className="text-sm text-ink-muted">
            <span className="text-ink">There is none yet.</span> This strategy has not struck a
            valuation, so no performance figure exists to show you. What qualified it to open was a
            backtest on historical data — a simulation of how the rules would have behaved, which
            is not a result and does not predict one.
          </p>
        ) : (
          <div className="flex flex-wrap gap-8">
            <Metric label="Assets under management">
              <Amount value={strategy.aum ?? '0'} symbol={strategy.baseAssetSymbol} />
            </Metric>
            <Metric label="NAV per unit">
              <Amount value={strategy.navPerUnit} />
            </Metric>
            <Metric label="Investors">{strategy.investorCount}</Metric>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fees</CardTitle>
        </CardHeader>
        <dl className="space-y-3 text-sm">
          <FeeRow label="Performance fee" value={bps(strategy.perfFeeBps)}>
            Charged only on profit above your own high water mark. If the strategy loses and then
            recovers, you are not charged again for the same gain — the mark ratchets up and never
            down.
          </FeeRow>
          <FeeRow
            label="Management fee"
            value={strategy.mgmtFeeBps === 0 ? 'None' : `${bps(strategy.mgmtFeeBps)} a year`}
          >
            {strategy.mgmtFeeBps === 0
              ? 'You are charged nothing while the strategy makes no profit.'
              : 'Accrued daily on your position value, for the time your capital is managed.'}
          </FeeRow>
        </dl>

        {strategy.perfFeeBps >= 5000 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="text-xs text-ink-muted">
              <p className="font-medium text-ink">
                You keep {bps(10000 - strategy.perfFeeBps)} of any profit. The manager takes{' '}
                {bps(strategy.perfFeeBps)}.
              </p>
              <p className="mt-1">
                Read that together with the drawdown limit below. The manager shares your profit but
                not your losses, which is an incentive to take risk; the{' '}
                {bps(strategy.maxDrawdownBps)} limit is the hard stop that bounds how much. Neither
                number means much without the other.
              </p>
              <p className="mt-1">
                In practice: a year in which the strategy gains 20% before fees leaves you with
                roughly {bps(Math.round(2000 * (1 - strategy.perfFeeBps / 10000)))}.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What binds you</CardTitle>
        </CardHeader>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Term label="Minimum investment">
            <Amount value={strategy.minimumInvestment} symbol={strategy.baseAssetSymbol} />
          </Term>
          {strategy.maximumInvestment && (
            <Term label="Maximum investment">
              <Amount value={strategy.maximumInvestment} symbol={strategy.baseAssetSymbol} />
            </Term>
          )}
          <Term label="Lock-up">
            {strategy.lockupDays === 0
              ? 'None — you may request redemption at any time'
              : `${strategy.lockupDays} days from the date you invest`}
          </Term>
          <Term label="Redemption notice">
            {strategy.redemptionNoticeDays === 0
              ? 'None'
              : `${strategy.redemptionNoticeDays} days before your funds are returned`}
          </Term>
          <Term label="Valuation and dealing">
            {strategy.dealingFrequency === 'DAILY'
              ? 'Daily'
              : strategy.dealingFrequency === 'WEEKLY'
                ? 'Weekly'
                : 'Monthly'}{' '}
            — subscriptions and redemptions settle at the next valuation, not instantly, so nobody
            can buy or sell at a stale price
          </Term>
          <Term label="Maximum drawdown limit">
            {bps(strategy.maxDrawdownBps)} — trading is halted on breach
          </Term>
        </dl>
      </Card>

      <Card className="border-negative/30">
        <CardHeader>
          <CardTitle>What can go wrong</CardTitle>
        </CardHeader>
        <ul className="space-y-2 text-sm text-ink-muted">
          <li>
            <span className="text-ink">You can lose money, including your entire investment.</span>{' '}
            The drawdown limit halts trading; it does not refund losses already taken.
          </li>
          <li>
            Historical and backtested performance describe the past. They are not a forecast and
            nothing here is promised.
          </li>
          <li>
            During a lock-up or notice period you cannot access your capital, whatever the market
            does in the meantime.
          </li>
          <li>
            A redemption may be queued if the strategy holds positions rather than cash. You will
            not be paid out of platform funds to cover the gap.
          </li>
        </ul>
      </Card>

      {agreement && (
        <Card>
          <CardHeader>
            <CardTitle>Risk disclosure</CardTitle>
          </CardHeader>
          {acceptance?.accepted ? (
            <div className="mb-3 flex items-center gap-2 text-sm text-positive">
              <Check className="h-4 w-4" />
              Accepted — version {acceptance.agreementVersion}
            </div>
          ) : (
            <p className="mb-3 text-sm text-ink-muted">
              You will be asked to accept this before any subscription. Reading it now costs
              nothing.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <MarkdownLite text={agreement.bodyMarkdown} />
          </div>
          <Link
            href="/managed-accounts"
            className="mt-3 inline-flex text-sm font-medium text-accent hover:underline"
          >
            Review and accept →
          </Link>
        </Card>
      )}

      <Card>
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            <span className="text-ink">Subscribing ships in MVP13.</span> The accounting behind it
            already exists and is tested: units, pooled custody, and a database-level boundary that
            makes it structurally impossible to move pool assets to the platform outside the fee
            schedule shown above. What is missing is the dealing-point machinery that issues units
            at an independently struck valuation.
          </p>
        </div>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/investments"
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All strategies
    </Link>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-lg">{children}</div>
    </div>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

function FeeRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 font-medium">
        {label}
        <span className="ml-2 font-mono text-ink-muted">{value}</span>
      </dt>
      <dd className="text-ink-muted">{children}</dd>
    </div>
  );
}
