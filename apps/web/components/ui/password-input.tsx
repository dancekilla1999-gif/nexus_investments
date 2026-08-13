'use client';

import { Eye, EyeOff } from 'lucide-react';
import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '@/lib/cn';

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(
            'h-11 w-full rounded-xl border border-border bg-surface px-3.5 pr-11 text-sm text-ink placeholder:text-ink-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
