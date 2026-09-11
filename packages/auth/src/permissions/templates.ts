import {
  CATALOG_VERSION,
  PERMISSION_KEYS,
  SCREEN_DEFS,
  type PermissionKey,
} from './catalog';

export type JobTemplateKey =
  | 'owner'
  | 'admin'
  | 'accountant'
  | 'sales'
  | 'purchasing'
  | 'warehouse'
  | 'cashier'
  | 'viewer';

export type JobTemplate = {
  key: JobTemplateKey;
  name: string;
  slug: string;
  grants: PermissionKey[];
};

function allKeys(): PermissionKey[] {
  return [...PERMISSION_KEYS];
}

function prefixKeys(prefixes: string[], mode: 'read' | 'write' | 'all'): PermissionKey[] {
  const out: PermissionKey[] = [];
  for (const key of PERMISSION_KEYS) {
    const hit = prefixes.some((p) => key === p || key.startsWith(`${p}.`) || key.startsWith(`${p}`));
    if (!hit) continue;
    if (mode === 'all') out.push(key);
    else if (mode === 'write' && key.endsWith('.write')) out.push(key);
    else if (mode === 'read' && key.endsWith('.read')) out.push(key);
  }
  return out;
}

function unique(keys: PermissionKey[]): PermissionKey[] {
  return [...new Set(keys)];
}

const SALES_SCREENS = SCREEN_DEFS.filter((s) => s.module === 'sales').map((s) => s.keyPrefix);
const PURCHASE_SCREENS = SCREEN_DEFS.filter((s) => s.module === 'purchase').map((s) => s.keyPrefix);

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    key: 'owner',
    name: 'Owner',
    slug: 'owner',
    grants: allKeys(),
  },
  {
    key: 'admin',
    name: 'Admin',
    slug: 'admin',
    grants: allKeys().filter((k) => k !== 'company.lifecycle.write' && k !== 'company.reset.write'),
  },
  {
    key: 'accountant',
    name: 'Accountant',
    slug: 'accountant',
    grants: unique([
      ...prefixKeys(
        [
          'accounting.simple_entry',
          'accounting.cashbook',
          'accounting.accounts',
          'accounting.reconciliation',
        ],
        'write',
      ),
      ...prefixKeys(
        [
          'accounting.simple_entry',
          'accounting.cashbook',
          'accounting.dashboard',
          'accounting.transactions',
          'accounting.journal',
          'accounting.reports',
          'accounting.accounts',
          'accounting.reconciliation',
          'parties.customers',
          'parties.vendors',
          'company.tax',
        ],
        'read',
      ),
      ...SALES_SCREENS.flatMap((p) => [`${p}.read` as PermissionKey]),
      ...PURCHASE_SCREENS.flatMap((p) => [`${p}.read` as PermissionKey]),
    ]),
  },
  {
    key: 'sales',
    name: 'Sales',
    slug: 'sales',
    grants: unique([
      ...prefixKeys(
        [
          'parties.customers',
          'sales.quotations',
          'sales.orders',
          'sales.invoices',
          'sales.payments',
          'sales.returns',
        ],
        'write',
      ),
      ...prefixKeys(
        [
          'parties.customers',
          'sales.quotations',
          'sales.orders',
          'sales.invoices',
          'sales.payments',
          'sales.aging',
          'sales.returns',
          'sales.discounts',
          'inventory.products',
          'inventory.levels',
        ],
        'read',
      ),
    ]),
  },
  {
    key: 'purchasing',
    name: 'Purchasing',
    slug: 'purchasing',
    grants: unique([
      ...prefixKeys(
        [
          'parties.vendors',
          'purchase.orders',
          'purchase.receipts',
          'purchase.bills',
          'purchase.expenses',
          'purchase.import',
          'purchase.returns',
        ],
        'write',
      ),
      ...prefixKeys(
        [
          'parties.vendors',
          'purchase.orders',
          'purchase.receipts',
          'purchase.bills',
          'purchase.expenses',
          'purchase.import',
          'purchase.returns',
          'purchase.aging',
          'inventory.products',
          'inventory.levels',
        ],
        'read',
      ),
    ]),
  },
  {
    key: 'warehouse',
    name: 'Warehouse',
    slug: 'warehouse',
    grants: unique([
      ...prefixKeys(
        [
          'inventory.products',
          'inventory.categories',
          'inventory.transfers',
          'inventory.adjustments',
          'purchase.receipts',
          'rental.dispatch',
        ],
        'write',
      ),
      ...prefixKeys(
        [
          'inventory.products',
          'inventory.categories',
          'inventory.levels',
          'inventory.ledger',
          'inventory.transfers',
          'inventory.adjustments',
          'purchase.receipts',
          'rental.dispatch',
        ],
        'read',
      ),
    ]),
  },
  {
    key: 'cashier',
    name: 'Cashier',
    slug: 'cashier',
    grants: unique([
      'pos.terminal.write',
      'pos.shift.write',
      'pos.history.read',
      'sales.invoices.read',
      'sales.payments.write',
      'sales.payments.read',
      'parties.customers.read',
    ]),
  },
  {
    key: 'viewer',
    name: 'Viewer',
    slug: 'viewer',
    grants: PERMISSION_KEYS.filter(
      (k) =>
        k.endsWith('.read') &&
        !k.startsWith('team.') &&
        k !== 'company.lifecycle.write' &&
        k !== 'company.reset.write',
    ),
  },
];

export { CATALOG_VERSION };

export function templateByKey(key: string): JobTemplate | undefined {
  return JOB_TEMPLATES.find((t) => t.key === key);
}
