'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.getMe });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('UTC');
  const [antiPhishingCode, setAntiPhishingCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.profile?.firstName ?? '');
    setLastName(me.profile?.lastName ?? '');
    setCountry(me.profile?.country ?? '');
    setPreferredCurrency(me.profile?.preferredCurrency ?? 'USD');
    setTimezone(me.profile?.timezone ?? 'UTC');
  }, [me]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile({
        firstName,
        lastName,
        country: country || undefined,
        preferredCurrency,
        timezone,
        ...(antiPhishingCode ? { antiPhishingCode } : {}),
      });
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      toast.error('Could not update profile', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">{me?.email}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Last name">
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" hint="ISO 3166-1 alpha-2, e.g. US">
                <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
              </Field>
              <Field label="Preferred currency">
                <Input
                  value={preferredCurrency}
                  onChange={(e) => setPreferredCurrency(e.target.value.toUpperCase())}
                  maxLength={8}
                />
              </Field>
            </div>
            <Field label="Timezone">
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
            <Field
              label="Anti-phishing code"
              hint="Shown in every platform email so you can spot a phishing attempt — set once, changeable here."
            >
              <Input
                value={antiPhishingCode}
                onChange={(e) => setAntiPhishingCode(e.target.value)}
                placeholder="Leave blank to keep current"
                maxLength={32}
              />
            </Field>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
