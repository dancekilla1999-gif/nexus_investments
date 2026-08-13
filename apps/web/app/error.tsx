'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-negative">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Unexpected error</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        This has been logged. You can try again, or head back to the dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
        <Button onClick={() => (window.location.href = '/dashboard')}>Go to dashboard</Button>
      </div>
    </main>
  );
}
