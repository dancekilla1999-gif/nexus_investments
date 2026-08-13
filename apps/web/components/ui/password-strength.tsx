import { cn } from '@/lib/cn';

function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const colors = ['bg-negative', 'bg-negative', 'bg-warning', 'bg-accent', 'bg-positive'];

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn('h-1 flex-1 rounded-full bg-border', i < score && colors[score])}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{labels[score]}</p>
    </div>
  );
}
