import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function SubscriptionsPage() {
  return <ModulePreview module={modules.subscriptions} />;
}
