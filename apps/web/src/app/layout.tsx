import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookOne',
  description: 'Multi-tenant SaaS Accounting & ERP',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
