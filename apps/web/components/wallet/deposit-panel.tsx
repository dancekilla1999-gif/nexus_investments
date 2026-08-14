'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Copy,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { DepositRecord } from '@/lib/types';

/**
 * On-chain deposits: address issuance on one side, arrival tracking on the other.
 *
 * Two things this screen has to get right, because getting them wrong costs a user their money:
 *
 *  1. **The chain must be unmissable.** Sending USDC on Ethereum to an address issued for a
 *     different chain loses the funds permanently. The chain is stated on the address, in the
 *     warning, and again next to the copy button — not tucked into a dropdown label.
 *  2. **Pending must not read as spendable.** A deposit awaiting confirmations is shown with its
 *     confirmation progress and an explicit "not yet spendable", because the balance card will
 *     show it in the Pending bucket at the same moment.
 */
export function DepositPanel() {
  const queryClient = useQueryClient();
  const [chainKey, setChainKey] = useState<string | null>(null);

  const { data: chains, isLoading: chainsLoading } = useQuery({
    queryKey: ['deposit-chains'],
    queryFn: api.getDepositableChains,
  });

  const { data: deposits, isLoading: depositsLoading } = useQuery({
    queryKey: ['deposits'],
    queryFn: api.listDeposits,
    // A deposit arrives on the chain's schedule, not on a click. Polling keeps the confirmation
    // count moving without the user reloading to find out whether their money showed up.
    refetchInterval: 20_000,
  });

  // The balance cards on this page are cached separately from the deposit list. When the
  // deposit poll observes a new credit, those numbers are stale — refresh them rather than
  // making the user reload to find out their money arrived. Keyed on the credited *count* so
  // this fires once per newly-credited deposit, not on every poll.
  const creditedCount = (deposits ?? []).filter((d) => d.status === 'CREDITED').length;
  useEffect(() => {
    if (creditedCount > 0) {
      void queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
    }
  }, [creditedCount, queryClient]);

  const selected = chainKey ?? chains?.[0] ?? null;

  const address = useMutation({
    mutationFn: (key: string) => api.getDepositAddress(key),
    onError: (err) =>
      toast.error('Could not issue an address', err instanceof ApiError ? err.message : undefined),
  });

  const activeAddress =
    address.data && address.data.chainKey === selected ? address.data : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-ink-muted" />
            Deposit
          </CardTitle>
        </CardHeader>

        {chainsLoading ? (
          <Skeleton className="h-11 w-full" />
        ) : !chains || chains.length === 0 ? (
          // Honest empty state: a deployment without an RPC endpoint and account xpub cannot
          // watch a chain, and showing a deposit address it is not watching would invite a user
          // to send funds nobody is looking for.
          <p className="text-sm text-ink-muted">
            No chains are configured for deposits in this deployment. An address can only be
            issued for a chain the platform is actively watching — otherwise funds sent to it
            would go undetected.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {chains.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setChainKey(key);
                    address.reset();
                  }}
                  className={
                    key === selected
                      ? 'rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium capitalize text-accent'
                      : 'rounded-lg border border-border bg-surface px-3 py-1.5 text-sm capitalize text-ink-muted transition-colors hover:text-ink'
                  }
                >
                  {key}
                </button>
              ))}
            </div>

            {activeAddress ? (
              <AddressCard
                address={activeAddress.address}
                chainName={activeAddress.chainName}
                confirmationsRequired={activeAddress.confirmationsRequired}
                isTestnet={activeAddress.isTestnet}
                // Defaulted rather than assumed present: during a rolling deploy this page can
                // briefly talk to an API that predates the field. Falling back to "nothing is
                // creditable" shows the do-not-send warning, which is the safe way to be wrong.
                assetSymbols={activeAddress.supportedAssets ?? []}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Your deposit address is derived once and stays the same — save it and reuse it.
                  It is generated from a watch-only extended public key, so the platform can see
                  what arrives without any signing key existing in its configuration.
                </p>
                <Button
                  onClick={() => selected && address.mutate(selected)}
                  loading={address.isPending}
                  disabled={!selected}
                >
                  Show my {selected} address
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deposits</CardTitle>
        </CardHeader>
        {depositsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !deposits || deposits.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing yet. A deposit appears here the moment it is seen on chain, before it has
            enough confirmations to be spendable.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {deposits.map((deposit) => (
              <DepositRow key={deposit.id} deposit={deposit} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddressCard({
  address,
  chainName,
  confirmationsRequired,
  isTestnet,
  assetSymbols,
}: {
  address: string;
  chainName: string;
  confirmationsRequired: number;
  isTestnet: boolean;
  assetSymbols: string[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied outright; the address is selectable on screen either way.
      toast.error('Could not copy', 'Select the address and copy it manually.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{chainName}</Badge>
        {isTestnet && <Badge tone="warning">Testnet — no real value</Badge>}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-3">
        <div className="text-xs text-ink-muted">Your {chainName} deposit address</div>
        <div className="mt-2 flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{address}</code>
          <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 text-xs text-ink-muted">
          <p className="font-medium text-ink">Send only on {chainName}.</p>
          <p className="mt-1">
            Assets sent on any other network, or tokens this platform does not support, cannot be
            credited and in most cases cannot be recovered by anyone.
          </p>
          {assetSymbols.length > 0 ? (
            <p className="mt-1">
              Creditable here: <span className="text-ink">{assetSymbols.join(', ')}</span>. Anything
              else arriving at this address will not be credited automatically.
            </p>
          ) : (
            // Never silently omit this. An address with nothing creditable behind it is a hole
            // to send money into, and saying nothing reads as "anything works".
            <p className="mt-1 text-negative">
              No asset on this chain is currently creditable in this deployment. Do not send funds
              to this address.
            </p>
          )}
          <p className="mt-1">
            Credited after {confirmationsRequired} confirmation
            {confirmationsRequired === 1 ? '' : 's'}. It will show as pending before then.
          </p>
        </div>
      </div>
    </div>
  );
}

function DepositRow({ deposit }: { deposit: DepositRecord }) {
  const credited = deposit.status === 'CREDITED';
  const failed = deposit.status === 'FAILED' || deposit.status === 'ORPHANED';

  const progress = Math.min(
    100,
    deposit.confirmationsRequired === 0
      ? 100
      : Math.round((deposit.confirmations / deposit.confirmationsRequired) * 100),
  );

  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm">
          <Amount value={deposit.amount} symbol={deposit.assetSymbol} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <span className="capitalize">{deposit.chainKey}</span>
          {deposit.explorerUrl && (
            <a
              href={deposit.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-ink"
            >
              {deposit.txHash.slice(0, 10)}…
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {credited ? (
          <Badge tone="positive">Credited</Badge>
        ) : failed ? (
          <Badge tone="negative">
            {deposit.status === 'ORPHANED' ? 'Reorged out' : 'Failed'}
          </Badge>
        ) : (
          <div className="space-y-1">
            <Badge tone="warning">
              <Loader2 className="h-3 w-3 animate-spin" />
              {deposit.confirmations}/{deposit.confirmationsRequired}
            </Badge>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full bg-warning transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[10px] text-ink-muted">Not yet spendable</div>
          </div>
        )}
      </div>
    </li>
  );
}
