'use client';

import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { Badge, BrandLockup, Button, Card, SelectLike } from '@/components/ui/bookone-ui';

export interface NavItem {
  label: string;
  icon: typeof Bell;
  href: string;
}

const navItems: NavItem[] = [
  { label: 'Simple Entry', icon: ReceiptText, href: '/' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Transactions', icon: ClipboardList, href: '/transactions' },
  { label: 'Journal', icon: BookOpenCheck, href: '/journal' },
  { label: 'Reports', icon: LineChart, href: '/reports' },
  { label: 'Accounts', icon: Landmark, href: '/accounts' },
  { label: 'Reconciliation', icon: ShieldCheck, href: '/reconciliation' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

export interface TenantLite {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface PeriodLite {
  current: string;       // YYYY-MM
  available: string[];   // YYYY-MM[]
}

export function BookOneShell({
  children,
  active = 'Simple Entry',
  tenant,
  period,
}: {
  children: ReactNode;
  active?: string;
  tenant?: TenantLite;
  period?: PeriodLite;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const currentMonthLabel = period?.current
    ? new Date(period.current + '-01').toLocaleString('en-US', { month: 'short', year: 'numeric' })
    : new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'is-collapsed'}`}>
      <aside className="sidebar" aria-label="BookOne workspace sidebar">
        <div className="sidebar-header">
          <BrandLockup compact={!sidebarOpen} />
          <Button
            variant="secondary"
            className="icon sidebar-toggle"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </Button>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">Accounting workspace</p>
          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link className={`nav-item ${item.label === active ? 'active' : ''}`} href={item.href} key={item.label} title={item.label}>
                <item.icon size={17} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-section sidebar-card">
          <Card padded>
            <Badge tone="success">Ready</Badge>
            <p className="card-subtitle" style={{ marginTop: 10 }}>
              Record daily business activity without accounting complexity.
            </p>
          </Card>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="cluster">
            <SelectLike>
              <span className="cluster">
                <Building2 size={16} /> {tenant?.name ?? 'Workspace'}
              </span>
            </SelectLike>
          </div>
          <div className="topbar-actions">
            <SelectLike>
              <span className="cluster"><CalendarDays size={16} /> {currentMonthLabel}</span>
            </SelectLike>
            <Button variant="secondary" className="icon" aria-label="Notifications">
              <Bell size={16} />
            </Button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
