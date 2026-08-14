'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Wallet as WalletIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Amount } from '@/components/finance/amount';
import { FaucetCard } from '@/components/wallet/faucet-card';
import { TransferForm } from '@/components/wallet/transfer-form';
import { api } from '@/lib/api-client';
import { LedgerBucket, WalletBalance } from '@/lib/types';

/** Every bucket is shown, including empty ones — "where did my funds go?" should be answerable. */
const BUCKETS: Array<{ type: LedgerBucket; label: string; description: string }> = [
  { type: 'AVAILABLE', label: 'Available', description: 'Free to trade, transfer, or withdraw' },
  { type: 'TRADING', label: 'Trading', description: 'Moved into the trading subsystem' },
  { type: 'LOCKED', label: 'Locked', description: 'Reserved against an open order or withdrawal' },
  { type: 'FUNDING', label: 'Funding', description: 'Wallet-side, not yet in trading' },
  { type: 'PENDING', label: 'Pending', description: 'Deposit seen on-chain, awaiting confirmations' },
  { type: 'BONUS', label: 'Bonus', description: 'Promotional balance, non-withdrawable' },
];

export default function WalletPage() {
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['wallet-balances'],
    queryFn: api.getWalletBalances,
  });
  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ['wallet-assets'],
    queryFn: api.getWalletAssets,
  });

  const held = (balances ?? []).filter((b) => b.amount !== '0');
  const assetSymbols = Array.from(new Set(held.map((b) => b.assetSymbol)));

  return (
    <div className="space-y-6 pb-12">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-accent">
          <WalletIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-sm text-ink-muted">
            Balances are held in a double-entry ledger, not read from a chain address.
          </p>
        </div>
      </header>

      {!assetsLoading && assets && <FaucetCard assets={assets} />}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balancesLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-28" />
              </Card>
            ))
          : BUCKETS.map((bucket) => (
              <BucketCard
                key={bucket.type}
                label={bucket.label}
                description={bucket.description}
                rows={(balances ?? []).filter((b) => b.type === bucket.type && b.amount !== '0')}
              />
            ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Internal transfer</CardTitle>
          </CardHeader>
          {assetsLoading || balancesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : (
            <TransferForm assets={assets ?? []} balances={balances ?? []} />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-ink-muted" />
                <span className="text-sm font-medium">Deposit</span>
              </div>
              <Badge tone="neutral">MVP2 — in progress</Badge>
            </div>
            <p className="text-sm text-ink-muted">
              On-chain deposit addresses need the blockchain adapters and chain watchers. The
              accounting they will post through is built and tested — the testnet faucet above
              already uses that exact path.
            </p>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-ink-muted" />
                <span className="text-sm font-medium">Withdraw</span>
              </div>
              <Badge tone="neutral">MVP3</Badge>
            </div>
            <p className="text-sm text-ink-muted">
              Withdrawals ship with the risk engine and AML screening that gate them — never
              before. See <code>docs/09-roadmap.md</code>.
            </p>
          </Card>
        </div>
      </div>

      {held.length > 0 && (
        <p className="text-xs text-ink-muted">
          Holding {assetSymbols.join(', ')} across {held.length} bucket
          {held.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}

function BucketCard({
  label,
  description,
  rows,
}: {
  label: string;
  description: string;
  rows: WalletBalance[];
}) {
  return (
    <Card>
      <div className="text-xs text-ink-muted">{label}</div>
      {rows.length === 0 ? (
        <div className="mt-2 font-mono text-2xl text-ink-muted">—</div>
      ) : (
        <div className="mt-2 space-y-1">
          {rows.map((row) => (
            <div key={`${row.assetId}-${row.type}`} className="text-xl">
              <Amount value={row.amount} symbol={row.assetSymbol} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted/70">{description}</p>
    </Card>
  );
}
