'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ComingSoonWidget } from '@/components/finance/coming-soon-widget';
import { DeviceList } from '@/components/security/device-list';
import { TwoFactorSetup } from '@/components/security/two-factor-setup';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';

export default function SecurityPage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.getMe });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Security Center</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage two-factor authentication, active devices, and account protections.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <TwoFactorSetup
            enabled={me?.totpEnabled ?? false}
            onChange={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active devices</CardTitle>
        </CardHeader>
        <DeviceList />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoonWidget
          title="Withdrawal address whitelist"
          milestone="MVP3"
          description="Lock withdrawals to pre-approved addresses with a time-locked cool-down."
        />
        <ComingSoonWidget
          title="Anomaly & risk alerts"
          milestone="MVP3"
          description="Withdrawal risk engine and anomaly detection notifications."
        />
      </div>
    </div>
  );
}
