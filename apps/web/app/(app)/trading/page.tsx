import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function TradingPage() {
  return <ModulePreview module={modules.trading} />;
}
