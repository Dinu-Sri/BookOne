import type { Metadata } from 'next';
import { Noto_Serif_Sinhala } from 'next/font/google';
import './globals.css';

/**
 * Noto Serif Sinhala — high readability for Sinhala gloss labels.
 * Loaded as a CSS variable; applied to .si-text and unicode Sinhala via stack.
 */
const notoSerifSinhala = Noto_Serif_Sinhala({
  subsets: ['sinhala'],
  weight: ['400', '500', '600', '700'],
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
      <body className={notoSerifSinhala.variable} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
