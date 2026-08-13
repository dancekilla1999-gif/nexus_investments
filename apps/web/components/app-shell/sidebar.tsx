'use client';

import { accountNavItems, primaryNavItems } from '@/lib/nav-items';
import { NavLink } from './nav-link';
import { Logo } from './logo';

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-4 py-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {primaryNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-border px-3 py-3">
        {accountNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </div>
    </aside>
  );
}
