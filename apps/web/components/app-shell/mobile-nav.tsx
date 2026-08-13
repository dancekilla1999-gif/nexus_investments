'use client';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { accountNavItems, primaryNavItems } from '@/lib/nav-items';
import { NavLink } from './nav-link';
import { Logo } from './logo';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Portaled to <body>: Topbar's `backdrop-blur` makes it a CSS containing block for
          `position: fixed` descendants (filter/backdrop-filter do this per spec), which would
          otherwise collapse this overlay to the header's own height instead of the viewport's.
          Portaling escapes that ancestor entirely rather than working around it in place. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 animate-fade-in bg-black/50"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface">
              <div className="flex items-center justify-between px-4 py-5">
                <Logo />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-raised"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
                {primaryNavItems.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </nav>
              <div className="space-y-0.5 border-t border-border px-3 py-3">
                {accountNavItems.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
