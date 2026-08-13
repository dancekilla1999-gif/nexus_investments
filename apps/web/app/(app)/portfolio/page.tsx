import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function PortfolioPage() {
  return <ModulePreview module={modules.portfolio} />;
}
