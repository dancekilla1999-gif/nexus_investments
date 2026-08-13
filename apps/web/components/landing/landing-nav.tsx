'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/app-shell/logo';

const links = [
  { href: '#markets', label: 'Markets' },
  { href: '#ai', label: 'AI Signals' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-transparent bg-base/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo href="/" />
        <div className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-ink-muted hover:text-ink">
              {link.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Create account</Button>
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-border bg-base px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm text-ink-muted hover:text-ink"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-3">
              <Link href="/login" className="flex-1">
                <Button variant="secondary" size="sm" className="w-full">
                  Log in
                </Button>
              </Link>
              <Link href="/register" className="flex-1">
                <Button size="sm" className="w-full">
                  Create account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
