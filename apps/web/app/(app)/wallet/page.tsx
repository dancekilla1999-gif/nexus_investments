import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function WalletPage() {
  return <ModulePreview module={modules.wallet} />;
}
