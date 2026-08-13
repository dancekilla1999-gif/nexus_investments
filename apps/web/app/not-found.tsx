import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-ink-muted">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        The page you&apos;re looking for doesn&apos;t exist, or hasn&apos;t shipped yet — check{' '}
        <code>docs/09-roadmap.md</code> for what&apos;s built.
      </p>
      <Link href="/" className="mt-6">
        <Button>Back to home</Button>
      </Link>
    </main>
  );
}
