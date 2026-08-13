import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function TransactionsPage() {
  return <ModulePreview module={modules.transactions} />;
}
