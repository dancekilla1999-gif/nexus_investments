import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SandboxBanner } from '@/components/sandbox-banner';
import { themeInitScript } from '@/components/theme-toggle';

const description =
  'Institutional-grade crypto investing and trading — custody, spot trading, P2P, and AI-assisted research in one account.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Nexus Investments', template: '%s · Nexus Investments' },
  description,
  openGraph: { title: 'Nexus Investments', description, type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Nexus Investments', description },
  robots: { index: false, follow: false }, // sandbox deployment — not for search indexing yet
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08090c' },
    { media: '(prefers-color-scheme: light)', color: '#fafafb' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Render-blocking, deliberately: applies a stored light-mode preference before first
            paint so there is no flash of the dark default. See components/theme-toggle.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <SandboxBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
