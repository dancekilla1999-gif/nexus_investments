'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Landmark, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownLite } from '@/components/legal/markdown-lite';
import { api, ApiError } from '@/lib/api-client';
import { modules } from '@/lib/modules';
import { toast } from '@/lib/toast';

export default function ManagedAccountsPage() {
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);

  const { data: agreement, isLoading: agreementLoading } = useQuery({
    queryKey: ['risk-disclosure-agreement'],
    queryFn: api.getCurrentRiskDisclosureAgreement,
  });
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['risk-disclosure-status'],
    queryFn: api.getRiskDisclosureStatus,
  });

  async function handleAccept() {
    setAccepting(true);
    try {
      await api.acceptRiskDisclosureAgreement();
      toast.success('Risk disclosure accepted', 'This has been recorded to your account.');
      queryClient.invalidateQueries({ queryKey: ['risk-disclosure-status'] });
    } catch (err) {
      toast.error('Could not record acceptance', err instanceof ApiError ? err.message : undefined);
    } finally {
      setAccepting(false);
    }
  }

  const info = modules.managedAccounts;
  const Icon = info.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{info.title}</h1>
          <p className="text-sm text-ink-muted">{info.tagline}</p>
        </div>
      </header>

      <Card className="border-warning/30">
        <div className="flex items-start gap-2 text-xs text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Discretionary trading of investor capital is a regulated activity in most
            jurisdictions. Account creation is not live in this deployment — what follows is the
            real risk disclosure and consent flow, built ahead of the trading machinery it will
            gate. See <code>docs/10-managed-accounts-architecture.md</code>.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk disclosure agreement</CardTitle>
          {status && (
            <Badge tone={status.accepted ? 'positive' : 'neutral'}>
              {status.accepted ? 'Accepted' : `Version ${status.agreementVersion}`}
            </Badge>
          )}
        </CardHeader>

        {agreementLoading || statusLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : agreement ? (
          <>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-surface p-4">
              <MarkdownLite text={agreement.bodyMarkdown} />
            </div>

            {status?.accepted ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-positive">
                <Check className="h-4 w-4" />
                Accepted on {status.acceptedAt ? new Date(status.acceptedAt).toLocaleString() : '—'}
              </div>
            ) : (
              <Button className="mt-4" onClick={handleAccept} loading={accepting}>
                I have read and accept this disclosure
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">No risk disclosure agreement is currently published.</p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">Account creation — not built yet</span>
          <Badge tone="accent">Ships in {info.milestone}</Badge>
        </div>
        <ul className="space-y-2.5">
          {info.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-ink-muted">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted/60" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
