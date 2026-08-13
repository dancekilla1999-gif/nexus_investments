import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ModuleInfo } from '@/lib/modules';

export function ModulePreview({ module }: { module: ModuleInfo }) {
  const Icon = module.icon;
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{module.title}</h1>
          <p className="text-sm text-ink-muted">{module.tagline}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">Not built yet in this deployment</span>
          <Badge tone="accent">Ships in {module.milestone}</Badge>
        </div>
        <ul className="space-y-2.5">
          {module.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-ink-muted">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted/60" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 text-xs text-ink-muted">
        Full design in <code>docs/09-roadmap.md</code> and <code>docs/07-ai-signal-architecture.md</code> /{' '}
        <code>docs/03-database-architecture.md</code> for the underlying schema, already migrated.
      </p>
    </div>
  );
}
