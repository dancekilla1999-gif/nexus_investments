import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SandboxBanner } from '@/components/sandbox-banner';

export const metadata: Metadata = {
  title: 'Nexus Investments',
  description:
    'Institutional-grade crypto investing and trading — custody, spot trading, P2P, and AI-assisted research in one account.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SandboxBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
