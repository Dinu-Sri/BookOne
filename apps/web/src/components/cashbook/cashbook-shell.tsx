'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { BrandLockup } from '@/components/ui/bookone-ui';
import { signOutCurrentUser } from '@/app/actions/auth-session';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';

export function CashbookShell({
  children,
  title,
  active = 'home',
  si = false,
  right,
  showFullErpLink = false,
}: {
  children: ReactNode;
  title: string;
  active?: 'home' | 'summary' | 'settings';
  si?: boolean;
  right?: ReactNode;
  /** Sole full — jump back to full ERP suites */
  showFullErpLink?: boolean;
}) {
  const nav = [
    { id: 'home' as const, href: '/cashbook', key: 'home' as const },
    { id: 'summary' as const, href: '/cashbook/summary', key: 'summary' as const },
    { id: 'settings' as const, href: '/cashbook/settings', key: 'settings' as const },
  ];

  return (
    <div className={`cashbook-app${si ? ' si-gloss-on' : ''}`}>
      <header className="cashbook-top">
        <div className="cashbook-top-left">
          <BrandLockup compact />
          <WorkspaceSwitcher compact currentName={undefined} />
          {/* Page title hidden on phone via CSS; keep for tablet+ */}
          <span className={`cashbook-title${si ? ' si-text' : ''}`} title={title}>
            {title}
          </span>
        </div>
        <div className="cashbook-top-right">
          {showFullErpLink ? (
            <Link href="/" className="cashbook-si-toggle" title="Full BookOne">
              <span className={si ? 'si-text' : undefined}>{si ? 'සම්පූර්ණ පද්ධතිය' : 'Full ERP'}</span>
            </Link>
          ) : null}
          {right}
          <form action={signOutCurrentUser}>
            <button
              type="submit"
              className="cashbook-si-toggle"
              aria-label={si ? 'ඉවත් වන්න' : 'Log out'}
              title={si ? 'ඉවත් වන්න' : 'Log out'}
            >
              <LogOut size={16} aria-hidden />
              <span className={`cashbook-logout-label${si ? ' si-text' : ''}`}>
                {si ? 'ඉවත් වන්න' : 'Log out'}
              </span>
            </button>
          </form>
        </div>
      </header>
      <main className="cashbook-main">{children}</main>
      <nav className="cashbook-nav" aria-label="Cashbook">
        {nav.map((item) => {
          const label =
            item.key === 'home'
              ? si
                ? 'මුල් පිටුව'
                : 'Home'
              : item.key === 'summary'
                ? si
                  ? 'සාරාංශය'
                  : 'Summary'
                : si
                  ? 'සැකසුම්'
                  : 'Settings';
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`cashbook-nav-item ${active === item.id ? 'active' : ''}`}
            >
              <span className={si ? 'si-text' : undefined} lang={si ? 'si' : undefined}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
