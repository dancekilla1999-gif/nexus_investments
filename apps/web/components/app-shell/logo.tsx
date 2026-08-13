import Link from 'next/link';

export function Logo({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" className="shrink-0 rounded-lg">
        <rect width="32" height="32" rx="8" className="fill-surface-raised" />
        <path
          d="M8 21 L13 14 L17 17 L24 8"
          stroke="rgb(var(--color-accent))"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="24" cy="8" r="2" className="fill-accent" />
      </svg>
      <span className="text-sm font-semibold tracking-tight text-ink">Nexus Investments</span>
    </Link>
  );
}
