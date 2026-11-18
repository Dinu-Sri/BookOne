'use client';

import { Bell, CalendarDays, Check, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLockup, Button } from '@/components/ui/bookone-ui';
import { bookoneAppVersion, bookoneBuildId, bookoneVersionLabel } from '@/lib/build-id';
import { PeriodSelector } from '@/components/layout/period-selector';
import { StatusToast } from '@/components/layout/status-toast';
import { signOutCurrentUser } from '@/app/actions/auth-session';
import { normalizeModules, type TenantModules } from '@/lib/platform-modules';
import {
  hasReadOnlyAdvancedModules,
  homePathForEntity,
  needsOnboarding,
  parseEntityKind,
  usesPersonalShell,
} from '@/lib/entity-kind';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';
import { ListSuiteNav } from '@/components/layout/sidebar-nav';
import { CASHBOOK_NAV_ITEM, NAV_SUITES, type NavItem } from '@/lib/nav-suites';
import { filterVisibleSuites, suiteIdForActiveLabel } from '@/lib/nav-visibility';

export type { NavItem };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function DateQuickAccess() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startOffset = first.getDay();
    const totalDays = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    return Array.from({ length: startOffset + totalDays }, (_, index) => {
      if (index < startOffset) return null;
      return new Date(view.getFullYear(), view.getMonth(), index - startOffset + 1);
    });
  }, [view]);
  const label = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const monthLabel = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="date-quick">
      <button className="date-trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <CalendarDays size={16} />
        <span>{label}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="date-menu">
          <div className="date-menu-head date-menu-nav">
            <button
              type="button"
              className="date-nav-btn"
              aria-label="Previous month"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              className="date-nav-btn"
              aria-label="Next month"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <div className="date-grid date-weekdays">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-grid">
            {days.map((day, index) =>
              day ? (
                <button
                  className={sameDay(day, today) ? 'today' : ''}
                  type="button"
                  key={day.toISOString()}
                  onClick={() => setOpen(false)}
                >
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
  userName?: string;
  userFirstName?: string;
  userRole?: string;
  jobTitle?: string;
  status?: string;
  modules?: TenantModules;
  /** personal | sole_prop | company | pending */
  entityKind?: string;
  capabilityTier?: string | null;
  platformRole?: 'super_admin' | 'user';
  jobSlug?: string | null;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
  /** First screen this job can open; used when a typed URL is denied. */
  landingHref?: string;
  agentBridgeEnabled?: boolean;
  timezone?: string;
  baseCurrency?: string;
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
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isSuperAdmin = tenant?.platformRole === 'super_admin' || tenant?.userRole === 'super_admin';

  // Personal-only workspaces stay in cashbook (unless super admin / Control Room).
  // Sole lite may enter ERP to view history after a downgrade (read-only advanced modules).
  useEffect(() => {
    if (!tenant?.entityKind) return;
    if (isSuperAdmin) return;
    const kind = parseEntityKind(tenant.entityKind);
    if (needsOnboarding(kind)) {
      router.replace('/onboarding');
      return;
    }
    if (kind === 'personal') {
      router.replace(homePathForEntity(kind, tenant.capabilityTier));
    }
  }, [tenant?.entityKind, tenant?.capabilityTier, router, isSuperAdmin]);

  useEffect(() => {
    if (!tenant?.accessByLabel || !active || isSuperAdmin) return;
    if (active === 'Documentation' || active === 'Control Room') return;
    if (tenant.accessByLabel[active] === 'none') {
      const dest = tenant.landingHref || '/';
      if (dest === '/' && active === 'Simple Entry') return;
      router.replace(`${dest}?denied=1`);
    }
  }, [tenant?.accessByLabel, active, isSuperAdmin, router]);

  const modules = useMemo(
    () => normalizeModules(tenant?.modules, tenant?.plan ?? 'starter'),
    [tenant?.modules, tenant?.plan],
  );
  const entityKind = tenant?.entityKind ? parseEntityKind(tenant.entityKind) : null;
  const soleNeedsCashbook = entityKind != null && usesPersonalShell(entityKind);
  const readOnlyAdvanced =
    entityKind != null &&
    hasReadOnlyAdvancedModules(entityKind, tenant?.capabilityTier, modules);

  const visibleSuites = useMemo(
    () =>
      filterVisibleSuites({
        suites: NAV_SUITES,
        isSuperAdmin,
        modules,
        entityKind,
        capabilityTier: tenant?.capabilityTier,
        accessByLabel: tenant?.accessByLabel,
        soleNeedsCashbook,
        cashbookItem: CASHBOOK_NAV_ITEM,
        agentBridgeEnabled: Boolean(tenant?.agentBridgeEnabled),
      }),
    [isSuperAdmin, modules, soleNeedsCashbook, entityKind, tenant?.capabilityTier, tenant?.accessByLabel, tenant?.agentBridgeEnabled],
  );
  const activeSuite = suiteIdForActiveLabel(visibleSuites, active) ?? 'accounting';
  const [openSuite, setOpenSuite] = useState(activeSuite);

  useEffect(() => {
    setOpenSuite(activeSuite);
  }, [activeSuite]);

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'is-collapsed'}`}>
      <aside className="sidebar" aria-label="BookOne workspace sidebar">
        <div className="sidebar-header">
          <BrandLockup compact={!sidebarOpen} href="/dashboard" />
          <Button
            variant="secondary"
            className="icon sidebar-toggle"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </Button>
        </div>
        {readOnlyAdvanced ? (
          <div className="sidebar-readonly-banner" title="Inventory/POS are view-only until you upgrade to sole full">
            View-only advanced modules
          </div>
        ) : null}

        <div className="sidebar-section suite-nav">
          <ListSuiteNav
            suites={visibleSuites}
            active={active}
            openSuite={openSuite}
            onOpenSuite={setOpenSuite}
            accessByLabel={tenant?.accessByLabel}
          />
        </div>
        <div className="sidebar-identity">
          {tenant?.userFirstName || tenant?.jobTitle ? (
            <div className="sidebar-user" data-testid="bookone-signed-in">
              <p className="sidebar-user-name">{tenant.userFirstName ?? 'User'}</p>
              {tenant.jobTitle ? <p className="sidebar-user-job">{tenant.jobTitle}</p> : null}
            </div>
          ) : null}
          <p className="sidebar-version" data-testid="bookone-build" title={bookoneVersionLabel()}>
            {sidebarOpen ? bookoneVersionLabel() : `v${bookoneAppVersion()}\n${bookoneBuildId()}`}
          </p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="cluster">
            <WorkspaceSwitcher currentName={tenant?.name} />
          </div>
          <div className="topbar-actions">
            <Suspense fallback={null}>
              <StatusToast />
            </Suspense>
            {period ? (
              <PeriodSelector
                selected={period.selected}
                available={period.available}
                compact
                timeZone={tenant?.timezone}
              />
            ) : (
              <DateQuickAccess />
            )}
            <Button variant="secondary" className="icon" aria-label="Notifications">
              <Bell size={16} />
            </Button>
            <form action={signOutCurrentUser}>
              <Button variant="secondary" className="icon" type="submit" aria-label="Logout" title="Logout">
                <LogOut size={16} />
              </Button>
            </form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
