import { MobileNav } from './mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from './user-menu';

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3 lg:hidden">
        <MobileNav />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
