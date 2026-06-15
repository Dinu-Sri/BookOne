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

const navItems = [
  { label: 'Simple Entry', icon: ReceiptText, href: '/' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '#' },
  { label: 'Transactions', icon: ClipboardList, href: '#' },
  { label: 'Journal', icon: BookOpenCheck, href: '#' },
  { label: 'Reports', icon: LineChart, href: '#' },
  { label: 'Accounts', icon: Landmark, href: '#' },
  { label: 'Reconciliation', icon: ShieldCheck, href: '#' },
  { label: 'Settings', icon: Settings, href: '#' },
];

export function BookOneShell({ children, active = 'Simple Entry' }: { children: ReactNode; active?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
              <span className="cluster"><Building2 size={16} /> Clossyan Holdings</span>
            </SelectLike>
          </div>
          <div className="topbar-actions">
            <SelectLike>
              <span className="cluster"><CalendarDays size={16} /> Jun 2026</span>
            </SelectLike>
            <Button variant="secondary" className="icon" aria-label="Notifications"><Bell size={16} /></Button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
