/** Sellable / nav modules (accounting + company are always on). */
export const MODULE_KEYS = ['sales', 'purchase', 'inventory', 'pos', 'hr'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type TenantModules = Record<ModuleKey, boolean>;

export const PLANS = ['starter', 'growth', 'pro'] as const;
export type PlanId = (typeof PLANS)[number];

export const MODULE_CATALOG: {
  key: ModuleKey | 'accounting' | 'company';
  name: string;
  summary: string;
  alwaysOn?: boolean;
}[] = [
  {
    key: 'accounting',
    name: 'Accounting',
    summary: 'Ledger, simple entry, journal, reports, reconciliation.',
    alwaysOn: true,
  },
  {
    key: 'company',
    name: 'Company',
    summary: 'Profile, tax, brands, locations, domains.',
    alwaysOn: true,
  },
  {
    key: 'sales',
    name: 'Sales',
    summary: 'Quotations, orders, invoices, AR, returns, discounts.',
  },
  {
    key: 'purchase',
    name: 'Purchase',
    summary: 'PO, GRN, bills, cash purchase, AP, suppliers.',
  },
  {
    key: 'inventory',
    name: 'Inventory',
    summary: 'Products, stock levels, transfers, adjustments.',
  },
  {
    key: 'pos',
    name: 'POS',
    summary: 'Terminal, shifts, POS history.',
  },
  {
    key: 'hr',
    name: 'HR',
    summary: 'Employees and payroll (coming soon).',
  },
];

export function modulesForPlan(plan: string): TenantModules {
  const p = (plan || 'starter').toLowerCase();
  if (p === 'pro') {
    return { sales: true, purchase: true, inventory: true, pos: true, hr: false };
  }
  if (p === 'growth') {
    return { sales: true, purchase: true, inventory: true, pos: false, hr: false };
  }
  return { sales: true, purchase: true, inventory: false, pos: false, hr: false };
}

export function normalizeModules(raw: unknown, plan = 'starter'): TenantModules {
  const base = modulesForPlan(plan);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  // Empty object → treat as “legacy full access” for existing tenants, then apply plan defaults
  // only for missing keys; prefer explicit false when set.
  const hasAny = MODULE_KEYS.some((k) => k in obj);
  if (!hasAny) {
    // Legacy tenants with no flags: keep everything sellable on (except HR).
    return { sales: true, purchase: true, inventory: true, pos: true, hr: false };
  }
  const out = { ...base };
  for (const key of MODULE_KEYS) {
    if (key in obj) out[key] = Boolean(obj[key]);
  }
  return out;
}

/** Map shell nav suite id → module key (null = always visible). */
export function suiteModuleKey(suiteId: string): ModuleKey | null {
  if (suiteId === 'sales') return 'sales';
  if (suiteId === 'purchase') return 'purchase';
  if (suiteId === 'inventory') return 'inventory';
  return null;
}

export function isPosNavItem(label: string): boolean {
  return label === 'POS' || label === 'POS History';
}
