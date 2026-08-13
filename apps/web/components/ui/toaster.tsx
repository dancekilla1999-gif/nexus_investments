'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { dismissToast, useToasts, ToastItem, ToastVariant } from '@/lib/toast';
import { cn } from '@/lib/cn';

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-positive/30 text-positive',
  error: 'border-negative/30 text-negative',
  info: 'border-accent/30 text-accent',
};

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error: <XCircle className="h-4 w-4 shrink-0" />,
  info: <Info className="h-4 w-4 shrink-0" />,
};

export function Toaster() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: ToastItem }) {
  useEffect(() => {
    const timeout = setTimeout(() => dismissToast(toast.id), 5000);
    return () => clearTimeout(timeout);
  }, [toast.id]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-surface-raised p-3.5 shadow-lg',
        variantStyles[toast.variant],
      )}
    >
      {variantIcon[toast.variant]}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-ink-muted">{toast.description}</p>}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="text-ink-muted hover:text-ink"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
