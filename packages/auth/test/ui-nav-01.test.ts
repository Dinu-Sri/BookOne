import { readFileSync } from 'node:fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  filterVisibleSuites,
  keepNavItem,
  legacySuitePanelMaxHeightPx,
} from '../../../apps/web/src/lib/nav-visibility';
import {
  parseNavMode,
  readNavMode,
  resolveTileSuite,
  writeNavMode,
  NAV_MODE_STORAGE_KEY,
} from '../../../apps/web/src/lib/nav-preference';
import { modulesForPlan } from '../../../apps/web/src/lib/platform-modules';

type NavItem = {
  label: string;
  subtitle?: string;
  icon: NavSuite['icon'];
  href?: string;
};
type NavSuite = {
  id: string;
  label: string;
  icon: () => null;
  items: NavItem[];
  superAdminOnly?: boolean;
};

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

const Icon = (() => null) as NavSuite['icon'];

function item(label: string, href: string, extra: Partial<NavItem> = {}): NavItem {
  return { label, href, icon: Icon, ...extra };
}

function suite(id: string, items: NavItem[], extra: Partial<NavSuite> = {}): NavSuite {
  return { id, label: id, icon: Icon, items, ...extra };
}

const accounting = suite('accounting', [
  item('Simple Entry', '/'),
  item('Dashboard', '/dashboard'),
  item('Reconciliation', '/reconciliation'),
  item('Documentation', '/docs'),
]);
const sales = suite('sales', [
  item('Sales Invoices', '/sales/invoices'),
  item('POS', '/pos', { subtitle: 'Terminal' }),
  item('POS History', '/sales/pos'),
]);
const company = suite('company', [
  item('Company Details', '/company/details'),
  item('Rental Settings', '/company/rental'),
  item('Team', '/company/team'),
]);
const inventory = suite('inventory', [
  item('Products', '/inventory/products'),
  item('Rental calendar', '/inventory/calendar'),
]);
const control = suite(
  'control-room',
  [item('Overview', '/control-room'), item('Companies', '/control-room/companies')],
  { superAdminOnly: true, label: 'Control Room' },
);

const allSuites = [accounting, sales, company, inventory, control];
const cashbookItem = item('Cashbook', '/cashbook', { subtitle: 'Personal · Business' });
const fullModules = {
  sales: true,
  purchase: true,
  inventory: true,
  pos: true,
  rental: true,
  hr: false,
};

describe('UI-NAV-01 clipping reproduction', () => {
  it('legacy per-item estimate clips View-only Accounting children', () => {
    const items = [
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
      { subtitle: undefined, viewOnly: true },
    ];
    const estimate = legacySuitePanelMaxHeightPx(items);
    const renderedWithViewOnly = items.reduce((h, it) => h + (it.viewOnly || it.subtitle ? 52 : 40), 12);
    expect(estimate).toBe(9 * 40 + 12);
    expect(renderedWithViewOnly).toBeGreaterThan(estimate);
  });

  it('production CSS uses natural grid height instead of the estimate', () => {
    const css = readRepo('apps/web/src/app/globals.css');
    const shell = readRepo('apps/web/src/components/layout/bookone-shell.tsx');
    const list = readRepo('apps/web/src/components/layout/sidebar-nav.tsx');
    expect(css).toContain('grid-template-rows: 0fr');
    expect(css).toContain('grid-template-rows: 1fr');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).not.toMatch(/@media \(max-width: 1180px\)[\s\S]*\.suite-panel \{\s*display: none/);
    expect(shell).not.toContain('subtitle ? 52 : 40');
    expect(list).not.toContain('maxHeight');
    expect(list).toContain('inert={!isOpen');
  });
});

describe('UI-NAV-01 documentation link and theme isolation', () => {
  it('Documentation is a real new-tab anchor in List and Tiles', () => {
    const nav = readRepo('apps/web/src/components/layout/sidebar-nav.tsx');
    expect(nav).toContain('target="_blank"');
    expect(nav).toContain('rel="noopener noreferrer"');
    expect(nav).toContain('opens in a new tab');
    expect(nav).not.toContain('window.open');
    expect(nav).toContain('isDocumentationItem');
  });

  it('docs layout restores html class and does not scan the whole app for Tailwind', () => {
    const layout = readRepo('apps/web/src/app/docs/layout.tsx');
    const css = readRepo('apps/web/src/app/docs/docs.css');
    const boundary = readRepo('apps/web/src/components/layout/docs-theme-boundary.tsx');
    expect(layout).toContain('DocsThemeBoundary');
    expect(layout).toContain("storageKey: 'bookone-docs-theme'");
    expect(css).toContain("tailwindcss/utilities");
    expect(css).not.toContain("@import 'tailwindcss';");
    expect(css).not.toContain("@source '../../**/*.{ts,tsx}'");
    expect(css).not.toContain('body:has(#nd-docs-layout)');
    expect(boundary).toContain("html.className = previousClass");
    expect(boundary).toContain('bookone-docs');
  });
});

describe('UI-NAV-01 List/Tiles preference', () => {
  it('defaults unknown and missing values to list', () => {
    expect(parseNavMode(undefined)).toBe('list');
    expect(parseNavMode('grid')).toBe('list');
    expect(parseNavMode('tiles')).toBe('tiles');
    expect(readNavMode(null)).toBe('list');
    expect(readNavMode({ getItem: () => { throw new Error('blocked'); } })).toBe('list');
  });

  it('writes the namespaced key and survives storage failure', () => {
    const store: Record<string, string> = {};
    writeNavMode('tiles', { setItem: (k, v) => { store[k] = v; } });
    expect(store[NAV_MODE_STORAGE_KEY]).toBe('tiles');
    expect(readNavMode({ getItem: (k) => store[k] ?? null })).toBe('tiles');
    writeNavMode('list', { setItem: () => { throw new Error('quota'); } });
  });

  it('does not restore a suite the current job cannot see', () => {
    expect(resolveTileSuite('inventory', ['accounting', 'sales'], 'accounting')).toBe('accounting');
    expect(resolveTileSuite('sales', ['accounting', 'sales'], 'accounting')).toBe('sales');
    expect(resolveTileSuite(null, ['accounting'], 'accounting')).toBe('accounting');
    expect(resolveTileSuite('ghost', [], null)).toBe(null);
  });
});

describe('UI-NAV-01 one permission model for List and Tiles', () => {
  it('Owner with full modules sees Control Room only when super-admin', () => {
    const owner = filterVisibleSuites({
      suites: allSuites,
      isSuperAdmin: false,
      modules: fullModules,
      entityKind: 'company',
      soleNeedsCashbook: false,
      cashbookItem,
    });
    expect(owner.map((s) => s.id)).toEqual(['accounting', 'sales', 'company', 'inventory']);
    const admin = filterVisibleSuites({
      suites: allSuites,
      isSuperAdmin: true,
      modules: fullModules,
      entityKind: 'company',
      soleNeedsCashbook: false,
      cashbookItem,
    });
    expect(admin.map((s) => s.id)).toContain('control-room');
  });

  it('Viewer read-only labels stay visible; none is hidden; docs stay', () => {
    const accessByLabel = {
      'Simple Entry': 'read' as const,
      Dashboard: 'read' as const,
      Reconciliation: 'none' as const,
      Documentation: 'read' as const,
      'Sales Invoices': 'none' as const,
    };
    const visible = filterVisibleSuites({
      suites: [accounting, sales],
      isSuperAdmin: false,
      modules: { ...modulesForPlan('starter'), pos: false },
      entityKind: 'company',
      accessByLabel,
      soleNeedsCashbook: false,
      cashbookItem,
    });
    const acc = visible.find((s) => s.id === 'accounting')!;
    expect(acc.items.map((i) => i.label)).toEqual(['Simple Entry', 'Dashboard', 'Documentation']);
    expect(visible.find((s) => s.id === 'sales')).toBeUndefined();
    expect(
      keepNavItem({ label: 'Documentation', href: '/docs', accessByLabel: { Documentation: 'none' } }),
    ).toBe(true);
  });

  it('restricted modules drop POS, rental, Control Room and personal Team', () => {
    const restricted = filterVisibleSuites({
      suites: allSuites,
      isSuperAdmin: false,
      modules: { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false },
      entityKind: 'personal',
      soleNeedsCashbook: true,
      cashbookItem,
    });
    expect(restricted.map((s) => s.id)).toEqual(['accounting', 'sales', 'company']);
    const acc = restricted.find((s) => s.id === 'accounting')!;
    expect(acc.items.some((i) => i.label === 'Cashbook')).toBe(true);
    const salesSuite = restricted.find((s) => s.id === 'sales')!;
    expect(salesSuite.items.some((i) => i.label === 'POS')).toBe(false);
    const companySuite = restricted.find((s) => s.id === 'company')!;
    expect(companySuite.items.some((i) => i.label === 'Team')).toBe(false);
    expect(companySuite.items.some((i) => i.label === 'Rental Settings')).toBe(false);
  });

  it('List and Tiles share the same destinations for a given job', () => {
    const visible = filterVisibleSuites({
      suites: allSuites,
      isSuperAdmin: true,
      modules: fullModules,
      entityKind: 'company',
      soleNeedsCashbook: false,
      cashbookItem,
    });
    const hrefs = visible.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain('/docs');
    expect(hrefs).toContain('/control-room');
  });
});
