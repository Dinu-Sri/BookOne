'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { BrandLockup } from '@/components/ui/bookone-ui';
import { signOutCurrentUser } from '@/app/actions/auth-session';

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
        <div className="cashbook-top-right">
          {right}
          <form action={signOutCurrentUser}>
            <button
              type="submit"
              className="cashbook-si-toggle"
              aria-label={si ? 'Log out (ඉවත් වන්න)' : 'Log out'}
              title={si ? 'Log out (ඉවත් වන්න)' : 'Log out'}
            >
              <LogOut size={16} aria-hidden />
              <span className="cashbook-logout-label">{si ? 'Log out' : 'Log out'}</span>
            </button>
          </form>
        </div>
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
