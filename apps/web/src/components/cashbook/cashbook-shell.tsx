'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/ui/bookone-ui';

export function CashbookShell({
  children,
  title,
  active = 'home',
  si = false,
  right,
}: {
  children: ReactNode;
  title: string;
  active?: 'home' | 'summary' | 'settings';
  si?: boolean;
  right?: ReactNode;
}) {
  const nav = [
    { id: 'home' as const, href: '/cashbook', en: 'Home', si: 'මුල් පිටුව' },
    { id: 'summary' as const, href: '/cashbook/summary', en: 'Summary', si: 'සාරාංශය' },
    { id: 'settings' as const, href: '/cashbook/settings', en: 'Settings', si: 'සැකසුම්' },
  ];

  return (
    <div className="cashbook-app">
      <header className="cashbook-top">
        <div className="cashbook-top-left">
          <BrandLockup compact />
          <span className="cashbook-title">{title}</span>
        </div>
        <div className="cashbook-top-right">{right}</div>
      </header>
      <main className="cashbook-main">{children}</main>
      <nav className="cashbook-nav" aria-label="Cashbook">
        {nav.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`cashbook-nav-item ${active === item.id ? 'active' : ''}`}
          >
            <span>{item.en}</span>
            {si ? <small>({item.si})</small> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
