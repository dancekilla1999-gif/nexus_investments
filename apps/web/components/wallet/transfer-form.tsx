'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { WalletAsset, WalletBalance } from '@/lib/types';

/**
 * Only the buckets a user may move funds between themselves. LOCKED and PENDING are moved by
 * the platform (an order reserving funds, a deposit awaiting confirmations) and are absent
 * here for the same reason the API rejects them — this mirrors the server rule, it does not
 * substitute for it.
 */
const TRANSFERABLE = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'TRADING', label: 'Trading' },
  { value: 'FUNDING', label: 'Funding' },
] as const;

export function TransferForm({
  assets,
  balances,
}: {
  assets: WalletAsset[];
  balances: WalletBalance[];
}) {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [from, setFrom] = useState<string>('AVAILABLE');
  const [to, setTo] = useState<string>('TRADING');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const available =
    balances.find((b) => b.assetId === assetId && b.type === from)?.amount ?? '0';
  const fromLabel = TRANSFERABLE.find((b) => b.value === from)?.label ?? from;
  const assetSymbol = assets.find((a) => a.id === assetId)?.symbol ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (from === to) {
      setError('Choose two different buckets.');
      return;
    }

    setSubmitting(true);
    try {
      await api.transferInternal({ from, to, assetId, amount });
      toast.success('Transfer complete');
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (assets.length === 0) {
    return <p className="text-sm text-ink-muted">No assets are enabled on this deployment.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Asset">
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.symbol} · {a.chainName}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <Field label="From">
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {TRANSFERABLE.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <ArrowRight className="mb-3.5 h-4 w-4 shrink-0 text-ink-muted" />
        <Field label="To">
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {TRANSFERABLE.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Amount" hint={`${fromLabel} balance: ${available}${assetSymbol ? ` ${assetSymbol}` : ''}`}>
        <div className="flex gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
          <Button type="button" variant="secondary" onClick={() => setAmount(available)}>
            Max
          </Button>
        </div>
      </Field>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <Button type="submit" loading={submitting} className="w-full">
        Transfer
      </Button>
    </form>
  );
}
