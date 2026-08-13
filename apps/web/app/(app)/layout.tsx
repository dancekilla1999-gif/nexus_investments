import { AuthGuard } from '@/components/app-shell/auth-guard';
import { Sidebar } from '@/components/app-shell/sidebar';
import { Topbar } from '@/components/app-shell/topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen">
        <Sidebar />
        <div className="lg:pl-64">
          <Topbar />
          <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
