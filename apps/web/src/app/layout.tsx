import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bookone.clossyan.com'),
  title: {
    default: 'BookOne',
    template: '%s | BookOne',
  },
  description: 'Simple business entry mapped to professional double-entry accounting.',
  robots: 'noindex, nofollow',
  icons: {
    icon: '/favicon.webp',
    shortcut: '/favicon.webp',
  },
  openGraph: {
    title: 'BookOne',
    description: 'Multi-tenant SaaS Accounting & ERP with an intelligent accounting engine.',
    images: ['/logo.webp'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Default light; Fumadocs/next-themes may toggle `dark` on <html> for /docs only.
    <html lang="en" className="light" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
