import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function OrdersPage() {
  return <ModulePreview module={modules.orders} />;
}
