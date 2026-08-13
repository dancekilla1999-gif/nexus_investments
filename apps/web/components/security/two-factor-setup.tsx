'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';

export function TwoFactorSetup({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [stage, setStage] = useState<'idle' | 'confirming' | 'done' | 'disabling'>('idle');
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
      toast.success('Two-factor authentication enabled');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setError(null);
    setLoading(true);
    try {
      await api.disable2fa(code);
      toast.success('Two-factor authentication disabled');
      setStage('idle');
      setCode('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  if (stage === 'done') {
    return (
      <div className="space-y-3">
        <Badge tone="positive">Two-factor authentication enabled</Badge>
        <p className="text-xs text-ink-muted">
          Save these backup codes now — each works once and they will not be shown again.
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-surface p-3 font-mono text-xs">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
    );
  }

  if (enabled && stage === 'disabling') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-muted">Enter your current 6-digit code to disable two-factor authentication.</p>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          <Button variant="danger" onClick={disable} loading={loading}>
            Disable
          </Button>
          <Button variant="ghost" onClick={() => setStage('idle')}>
            Cancel
          </Button>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">Protecting sign-in with an authenticator app</span>
        <div className="flex items-center gap-2">
          <Badge tone="positive">Enabled</Badge>
          <Button size="sm" variant="secondary" onClick={() => setStage('disabling')}>
            Disable
          </Button>
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
        <div className="break-all rounded-xl border border-border bg-surface p-3 font-mono text-xs">{secret}</div>
        <p className="text-[11px] text-ink-muted" title={otpauthUrl}>
          otpauth key generated — scan or paste the secret above into your authenticator app.
        </p>
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
      <div>
        <span className="text-sm text-ink-muted">Not enabled — recommended for every account</span>
        {error && <p className="text-xs text-negative">{error}</p>}
      </div>
      <Button size="sm" variant="secondary" onClick={startEnrollment} loading={loading}>
        Enable
      </Button>
    </div>
  );
}
