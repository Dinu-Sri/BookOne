'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Languages, LogOut, MoreHorizontal, ExternalLink } from 'lucide-react';
import { BrandLockup } from '@/components/ui/bookone-ui';
import { signOutCurrentUser } from '@/app/actions/auth-session';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';
import { writeSiGlossPreference } from '@/lib/si-gloss';

/**
 * Cashbook chrome — guide §5.5: Full ERP / language / logout behind one menu.
 * Daily surface stays: domain, month, tiles, list.
 */
export function CashbookShell({
  children,
  title,
  active = 'home',
  si = false,
  onSiChange,
  showFullErpLink = false,
  right,
}: {
  children: ReactNode;
  title: string;
  active?: 'home' | 'summary' | 'settings';
  si?: boolean;
  onSiChange?: (next: boolean) => void;
  showFullErpLink?: boolean;
  /** @deprecated Prefer ⋮ menu; still supported for page-specific controls */
  right?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const nav = [
    { id: 'home' as const, href: '/cashbook', en: 'Home', siLabel: 'මුල් පිටුව' },
    { id: 'summary' as const, href: '/cashbook/summary', en: 'Summary', siLabel: 'සාරාංශය' },
    { id: 'settings' as const, href: '/cashbook/settings', en: 'Settings', siLabel: 'සැකසුම්' },
  ];

  return (
    <div className={`cashbook-app${si ? ' si-gloss-on' : ''}`}>
      <header className="cashbook-top">
        <div className="cashbook-top-left">
          <BrandLockup compact />
          <WorkspaceSwitcher compact />
          <span className={`cashbook-title${si ? ' si-text' : ''}`} title={title}>
            {title}
          </span>
        </div>
        <div className="cashbook-top-right" ref={menuRef}>
          {right}
          <button
            type="button"
            className="cashbook-menu-btn"
            aria-label={si ? 'තවත්' : 'More'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={22} />
          </button>
          {menuOpen ? (
            <div className="cashbook-menu" role="menu">
              {showFullErpLink ? (
                <Link
                  href="/"
                  className="cashbook-menu-item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink size={16} />
                  <span>{si ? 'සම්පූර්ණ BookOne' : 'Full ERP'}</span>
                </Link>
              ) : null}
              {onSiChange ? (
                <button
                  type="button"
                  className="cashbook-menu-item"
                  role="menuitem"
                  onClick={() => {
                    const next = !si;
                    onSiChange(next);
                    writeSiGlossPreference(next);
                    setMenuOpen(false);
                  }}
                >
                  <Languages size={16} />
                  <span className={si ? undefined : 'si-text'} lang={si ? undefined : 'si'}>
                    {si ? 'English' : 'සිංහල'}
                  </span>
                </button>
              ) : null}
              <form action={signOutCurrentUser}>
                <button type="submit" className="cashbook-menu-item danger" role="menuitem">
                  <LogOut size={16} />
                  <span className={si ? 'si-text' : undefined}>{si ? 'ඉවත් වන්න' : 'Log out'}</span>
                </button>
              </form>
            </div>
          ) : null}
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
            <span className={si ? 'si-text' : undefined} lang={si ? 'si' : undefined}>
              {si ? item.siLabel : item.en}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
