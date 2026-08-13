'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { storeRefreshToken } from '@/lib/session';
import { toast } from '@/lib/toast';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [step, setStep] = useState<'credentials' | 'twoFactor'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loginTicket, setLoginTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login({ email, password });
      if ('twoFactorRequired' in result) {
        setLoginTicket(result.loginTicket);
        setStep('twoFactor');
      } else {
        storeRefreshToken(result.refreshToken);
        setSession(result.accessToken, result.user);
        toast.success('Welcome back');
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitTwoFactor(e: FormEvent) {
    e.preventDefault();
    if (!loginTicket) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.verifyLogin2fa({ loginTicket, code });
      storeRefreshToken(result.refreshToken);
      setSession(result.accessToken, result.user);
      toast.success('Welcome back');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {step === 'credentials' ? 'Log in' : 'Two-factor verification'}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        {step === 'credentials'
          ? 'Sandbox environment — no real funds.'
          : 'Enter the 6-digit code from your authenticator app, or a backup code.'}
      </p>
      <Card>
        {step === 'credentials' ? (
          <form onSubmit={onSubmitCredentials} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {error && <p className="text-sm text-negative">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmitTwoFactor} className="space-y-4">
            <Field label="Authentication code">
              <Input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </Field>
            {error && <p className="text-sm text-negative">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Verify
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setError(null);
              }}
              className="w-full text-center text-xs text-ink-muted hover:underline"
            >
              Back
            </button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
