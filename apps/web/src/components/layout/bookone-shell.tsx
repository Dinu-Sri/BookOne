'use client';

import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Calculator,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Globe2,
  Landmark,
  LayoutDashboard,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  ReceiptText,
  SlidersHorizontal,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { BrandLockup, Button, SelectLike } from '@/components/ui/bookone-ui';
import { PeriodSelector } from '@/components/layout/period-selector';
import { CompanyResetButton } from '@/components/layout/company-reset-button';

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
  superAdminOnly?: boolean;
}

const navSuites: NavSuite[] = [
  {
    id: 'accounting',
    label: 'Accounting',
    icon: Landmark,
    items: [
      { label: 'Simple Entry', icon: ReceiptText, href: '/' },
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Parties', icon: Users, href: '/parties' },
      { label: 'Invoices/Bills', icon: FileText, href: '/documents' },
      { label: 'Transactions', icon: ClipboardList, href: '/transactions' },
      { label: 'Journal', icon: BookOpenCheck, href: '/journal' },
      { label: 'Reports', icon: LineChart, href: '/reports' },
      { label: 'Accounts', icon: Landmark, href: '/accounts' },
      { label: 'Reconciliation', icon: ShieldCheck, href: '/reconciliation' },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    icon: Building2,
    items: [
      { label: 'Company Details', icon: Building2, href: '/company/details' },
      { label: 'Tax Info', icon: FileText, href: '/company/tax' },
      { label: 'Brands', icon: Package, href: '/company/brands' },
      { label: 'Locations', icon: Landmark, href: '/company/locations' },
      { label: 'Domain Verification', icon: Globe2, href: '/company/domains' },
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
  {
    id: 'control-room',
    label: 'Control Room',
    icon: SlidersHorizontal,
    superAdminOnly: true,
    items: [
      { label: 'Modules', icon: SlidersHorizontal, href: '/control-room/modules' },
      { label: 'Access Rules', icon: ShieldCheck },
      { label: 'Audit Controls', icon: ClipboardList },
    ],
  },
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function DateQuickAccess() {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOffset = first.getDay();
    const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Array.from({ length: startOffset + totalDays }, (_, index) => {
      if (index < startOffset) return null;
      return new Date(today.getFullYear(), today.getMonth(), index - startOffset + 1);
    });
  }, [today]);
  const label = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="date-quick">
      <button className="date-trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <CalendarDays size={16} />
        <span>{label}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="date-menu">
          <div className="date-menu-head">
            <strong>{monthLabel}</strong>
            <span>Today</span>
          </div>
          <div className="date-grid date-weekdays">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-grid">
            {days.map((day, index) =>
              day ? (
                <button className={sameDay(day, today) ? 'today' : ''} type="button" key={day.toISOString()} onClick={() => setOpen(false)}>
                  {day.getDate()}
                  {sameDay(day, today) ? <Check size={11} /> : null}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface TenantLite {
  id: string;
  name: string;
  slug: string;
  plan: string;
  userEmail?: string;
  userRole?: string;
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
  const isSuperAdmin = tenant?.userRole === 'super_admin' || tenant?.userEmail === 'dinu.sri.m@gmail.com';
  const visibleSuites = useMemo(() => navSuites.filter((suite) => !suite.superAdminOnly || isSuperAdmin), [isSuperAdmin]);
  const activeSuite = visibleSuites.find((suite) => suite.items.some((item) => item.label === active))?.id ?? 'accounting';
  const [openSuite, setOpenSuite] = useState(activeSuite);

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
            {visibleSuites.map((suite) => {
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
            <CompanyResetButton />
            {period ? (
              <PeriodSelector selected={period.selected} available={period.available} compact />
            ) : (
              <DateQuickAccess />
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
