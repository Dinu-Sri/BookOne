import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { FormBusyGuard } from '@/components/ui/form-busy';
import { bookoneAppVersion, bookoneBuildId } from '@/lib/build-id';
import './globals.css';

/**
 * Noto Serif Sinhala — high readability for Sinhala gloss labels.
 * Self-hosted so `next build` does not fetch Google Fonts CSS (CI flake:
 * extensionless `/l/font?kit=` URLs crash next/font/google).
 * Loaded as a CSS variable; applied to .si-text and unicode Sinhala via stack.
 */
const notoSerifSinhala = localFont({
  src: '../fonts/NotoSerifSinhala-sinhala-wght.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-si',
  preload: true,
});

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
    <html lang="en" className={`light ${notoSerifSinhala.variable}`} suppressHydrationWarning>
      <body
        className={notoSerifSinhala.variable}
        data-bookone-version={bookoneAppVersion()}
        data-bookone-build={bookoneBuildId()}
        suppressHydrationWarning
      >
        {children}
        <FormBusyGuard />
      </body>
    </html>
  );
}
