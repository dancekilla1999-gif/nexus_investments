import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Honest empty state for a dashboard widget whose backing module doesn't exist yet — never a
 * fabricated number standing in for a real one (docs/01-PRD.md principle #2,
 * docs/08-ui-ux-architecture.md §4).
 */
export function ComingSoonWidget({
  title,
  milestone,
  description,
}: {
  title: string;
  milestone: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge tone="neutral">{milestone}</Badge>
      </CardHeader>
      <p className="text-sm text-ink-muted">{description}</p>
    </Card>
  );
}
