import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function MarketsPage() {
  return <ModulePreview module={modules.markets} />;
}
