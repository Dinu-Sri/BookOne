'use client';

import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Calculator,
  ChevronDown,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { Badge, BrandLockup, Button, Card, SelectLike } from '@/components/ui/bookone-ui';
import { PeriodSelector } from '@/components/layout/period-selector';

export interface NavItem {
  label: string;
  icon: typeof Bell;
  href?: string;
}

interface NavSuite {
  id: string;
  label: string;
  icon: typeof Bell;
  items: NavItem[];
}

const navSuites: NavSuite[] = [
  {
    id: 'accounting',
    label: 'Accounting',
    icon: Landmark,
    items: [
      { label: 'Simple Entry', icon: ReceiptText, href: '/' },
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Transactions', icon: ClipboardList, href: '/transactions' },
      { label: 'Journal', icon: BookOpenCheck, href: '/journal' },
      { label: 'Reports', icon: LineChart, href: '/reports' },
      { label: 'Accounts', icon: Landmark, href: '/accounts' },
      { label: 'Reconciliation', icon: ShieldCheck, href: '/reconciliation' },
      { label: 'Settings', icon: Settings, href: '/settings' },
    ],
  },
  {
    id: 'tax',
    label: 'Tax',
    icon: Calculator,
    items: [
      { label: 'Tax Dashboard', icon: LayoutDashboard },
      { label: 'Returns', icon: ClipboardList },
      { label: 'Tax Invoices', icon: ReceiptText },
      { label: 'Compliance', icon: ShieldCheck },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    items: [
      { label: 'Items', icon: Package },
      { label: 'Stock Ledger', icon: ClipboardList },
      { label: 'Purchases', icon: ReceiptText },
      { label: 'Warehouses', icon: Landmark },
    ],
  },
  {
    id: 'pos',
    label: 'POS',
    icon: ShoppingCart,
    items: [
      { label: 'Register', icon: ShoppingCart },
      { label: 'Sales', icon: ReceiptText },
      { label: 'Shifts', icon: CalendarDays },
      { label: 'Devices', icon: PanelLeftOpen },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Users,
    items: [
      { label: 'Employees', icon: Users },
      { label: 'Payroll', icon: ReceiptText },
      { label: 'Attendance', icon: CalendarDays },
      { label: 'Leave', icon: CalendarDays },
    ],
  },
];

export interface TenantLite {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface PeriodLite {
  selected: string | null; // YYYY-MM or null for all time
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
  const activeSuite = navSuites.find((suite) => suite.items.some((item) => item.label === active))?.id ?? 'accounting';
  const [openSuite, setOpenSuite] = useState(activeSuite);

  const currentDateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const currentMonthLabel = period?.selected
    ? new Date(period.selected + '-01').toLocaleString('en-US', { month: 'short', year: 'numeric' })
    : currentDateLabel;

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

        <div className="sidebar-section suite-nav">
          <nav aria-label="Suite navigation">
            {navSuites.map((suite) => {
              const isOpen = openSuite === suite.id;
              const hasActiveItem = suite.items.some((item) => item.label === active);
              return (
                <div className={`suite-group ${isOpen ? 'open' : ''}`} key={suite.id}>
                  <button
                    className={`suite-trigger ${hasActiveItem ? 'active' : ''}`}
                    type="button"
                    title={suite.label}
                    aria-expanded={isOpen}
                    onClick={() => setOpenSuite(suite.id)}
                  >
                    <suite.icon size={17} />
                    <span>{suite.label}</span>
                    <ChevronDown className="suite-chevron" size={15} />
                  </button>
                  <div
                    className="suite-panel"
                    style={{ maxHeight: isOpen ? `${suite.items.length * 44 + 8}px` : '0px' }}
                  >
                    <div className="nav-list" aria-label={`${suite.label} navigation`}>
                      {suite.items.map((item) => {
                        const content = (
                          <>
                            <item.icon size={16} />
                            <span>{item.label}</span>
                            {!item.href ? <em>Soon</em> : null}
                          </>
                        );
                        return item.href ? (
                          <Link
                            className={`nav-item nav-child ${item.label === active ? 'active' : ''}`}
                            href={item.href}
                            key={item.label}
                            title={item.label}
                          >
                            {content}
                          </Link>
                        ) : (
                          <span className="nav-item nav-child disabled" key={item.label} title={`${item.label} coming soon`}>
                            {content}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
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
            {period ? (
              <PeriodSelector selected={period.selected} available={period.available} compact />
            ) : (
              <SelectLike>
                <span className="cluster"><CalendarDays size={16} /> {currentMonthLabel}</span>
              </SelectLike>
            )}
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
