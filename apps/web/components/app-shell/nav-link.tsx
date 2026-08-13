'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NavItem } from '@/lib/nav-items';

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-ink-muted group-hover:text-ink')} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.milestone && (
        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
          {item.milestone}
        </span>
      )}
    </Link>
  );
}
