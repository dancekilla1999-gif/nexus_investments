'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrength } from '@/components/ui/password-strength';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { storeRefreshToken } from '@/lib/session';
import { toast } from '@/lib/toast';

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.register({ email, password, firstName, lastName });
      storeRefreshToken(result.refreshToken);
      setSession(result.accessToken, result.user);
      toast.success('Account created', 'Welcome to Nexus Investments.');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Sandbox environment — no real funds. See the platform mode banner above.
      </p>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field label="Password" hint="At least 12 characters, one letter and one number.">
            <PasswordInput
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
