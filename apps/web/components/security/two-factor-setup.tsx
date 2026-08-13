'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';

export function TwoFactorSetup({ enabled, onEnabled }: { enabled: boolean; onEnabled: () => void }) {
  const [stage, setStage] = useState<'idle' | 'enrolling' | 'confirming' | 'done'>('idle');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.enroll2fa();
      setOtpauthUrl(result.otpauthUrl);
      setSecret(result.secret);
      setStage('confirming');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start enrollment.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrollment() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.confirm2fa(code);
      setBackupCodes(result.backupCodes);
      setStage('done');
      onEnabled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  if (enabled && stage !== 'done') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">Two-factor authentication</span>
        <Badge tone="positive">Enabled</Badge>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="space-y-3">
        <Badge tone="positive">Two-factor authentication enabled</Badge>
        <p className="text-xs text-ink-muted">
          Save these backup codes now — each works once and they will not be shown again.
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-surface-raised p-3 font-mono text-xs">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
    );
  }

  if (stage === 'confirming') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-muted">
          Add this key to your authenticator app, then enter the 6-digit code it generates.
        </p>
        <div className="break-all rounded-xl border border-border bg-surface-raised p-3 font-mono text-xs">
          {secret}
        </div>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          <Button onClick={confirmEnrollment} loading={loading}>
            Confirm
          </Button>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-muted">Two-factor authentication</span>
      <Button size="sm" variant="secondary" onClick={startEnrollment} loading={loading}>
        Enable
      </Button>
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
