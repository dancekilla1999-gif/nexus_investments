import { ShieldAlert } from 'lucide-react';

/**
 * Trust signal required by docs/08-ui-ux-architecture.md §2: whenever the platform is not in
 * PLATFORM_MODE=live, this is shown so nobody mistakes a pre-launch environment for one that
 * moves real money. See docs/02-system-architecture.md §4.
 */
export function SandboxBanner() {
  const isLive = process.env.NEXT_PUBLIC_PLATFORM_MODE === 'live';
  if (isLive) return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/20 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      Sandbox mode — testnet only. No real funds can be deposited, traded, or withdrawn on this
      deployment.
    </div>
  );
}
