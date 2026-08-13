'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function DeviceList() {
  const queryClient = useQueryClient();
  const { data: devices, isLoading } = useQuery({ queryKey: ['devices'], queryFn: api.listDevices });

  async function revoke(id: string) {
    try {
      await api.revokeDevice(id);
      toast.success('Device revoked', 'Its active sessions were signed out immediately.');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (err) {
      toast.error('Could not revoke device', err instanceof ApiError ? err.message : undefined);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const active = devices?.filter((d) => !d.revokedAt) ?? [];

  if (active.length === 0) {
    return <p className="text-sm text-ink-muted">No devices on record yet.</p>;
  }

  return (
    <div className="space-y-2">
      {active.map((device) => (
        <div
          key={device.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <Laptop className="h-4 w-4 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="truncate text-sm">{device.userAgent ?? 'Unknown device'}</p>
              <p className="text-xs text-ink-muted">
                {device.ip ?? 'unknown IP'} · last seen {formatDate(device.lastSeenAt)}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => revoke(device.id)} aria-label="Revoke device">
            <Trash2 className="h-4 w-4 text-negative" />
          </Button>
        </div>
      ))}
    </div>
  );
}
