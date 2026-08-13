import { ModulePreview } from '@/components/finance/module-preview';
import { modules } from '@/lib/modules';

export default function SignalsPage() {
  return <ModulePreview module={modules.signals} />;
}
