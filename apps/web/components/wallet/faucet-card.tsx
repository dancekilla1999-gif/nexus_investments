'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Droplets } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { WalletAsset } from '@/lib/types';

/**
 * Testnet faucet. Rendered only outside live mode, and the API refuses it there regardless —
 * this is a convenience for a sandbox deployment, not a control (docs/01-PRD.md principle #2).
 */
export function FaucetCard({ assets }: { assets: WalletAsset[] }) {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [loading, setLoading] = useState(false);

  if (process.env.NEXT_PUBLIC_PLATFORM_MODE === 'live' || assets.length === 0) return null;

  async function requestFunds() {
    setLoading(true);
    try {
      await api.sandboxFaucet({ assetId, amount: '1000' });
      toast.success('Test funds credited', 'Sandbox only — these are not real assets.');
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
    } catch (err) {
      toast.error('Faucet failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-warning/30">
      <div className="flex items-start gap-3">
        <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Testnet faucet</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Credits 1,000 units of play money so the wallet and ledger can be exercised before
            on-chain deposits exist. It posts through the same double-entry path a real deposit
            will. These are not real assets and have no value.
          </p>
          <div className="mt-3 flex gap-2">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} · {a.chainName}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={requestFunds} loading={loading}>
              Get test funds
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
