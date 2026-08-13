'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nexus.theme';
type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
    >
      {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/**
 * Inline, render-blocking so the correct theme applies before first paint — otherwise a user
 * who chose light mode sees a flash of the dark default on every navigation. Kept as a tiny
 * literal script string (not a component) specifically so Next.js emits it inline in <head>,
 * synchronously, ahead of hydration.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('${STORAGE_KEY}');
    if (stored === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
`;
