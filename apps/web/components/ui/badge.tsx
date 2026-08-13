import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-ink-muted border border-border',
  positive: 'bg-positive/10 text-positive border border-positive/20',
  negative: 'bg-negative/10 text-negative border border-negative/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  accent: 'bg-accent/10 text-accent border border-accent/20',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
