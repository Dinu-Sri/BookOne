export const CATALOG_VERSION = 1;

export type AccessLevel = 'none' | 'read' | 'write';
export type PermissionAction = 'read' | 'write';

export const PERMISSION_KEYS = [
  'accounting.simple_entry.read',
  'accounting.simple_entry.write',
  'accounting.cashbook.read',
  'accounting.cashbook.write',
  'accounting.dashboard.read',
  'accounting.transactions.read',
  'accounting.journal.read',
  'accounting.reports.read',
  'accounting.accounts.read',
  'accounting.accounts.write',
  'accounting.reconciliation.read',
  'accounting.reconciliation.write',
  'parties.customers.read',
  'parties.customers.write',
  'parties.vendors.read',
  'parties.vendors.write',
  'sales.quotations.read',
  'sales.quotations.write',
  'sales.orders.read',
  'sales.orders.write',
  'sales.invoices.read',
  'sales.invoices.write',
  'sales.payments.read',
  'sales.payments.write',
  'sales.aging.read',
  'sales.returns.read',
  'sales.returns.write',
  'sales.discounts.read',
  'sales.discounts.write',
  'pos.terminal.write',
  'pos.history.read',
  'pos.shift.write',
  'purchase.orders.read',
  'purchase.orders.write',
  'purchase.receipts.read',
  'purchase.receipts.write',
  'purchase.bills.read',
  'purchase.bills.write',
  'purchase.expenses.read',
  'purchase.expenses.write',
  'purchase.import.read',
  'purchase.import.write',
  'purchase.returns.read',
  'purchase.returns.write',
  'purchase.payments.read',
  'purchase.payments.write',
  'purchase.aging.read',
  'inventory.products.read',
  'inventory.products.write',
  'inventory.categories.read',
  'inventory.categories.write',
  'inventory.levels.read',
  'inventory.ledger.read',
  'inventory.transfers.read',
  'inventory.transfers.write',
  'inventory.adjustments.read',
  'inventory.adjustments.write',
  'rental.calendar.read',
  'rental.calendar.write',
  'rental.dispatch.read',
  'rental.dispatch.write',
  'company.details.read',
  'company.details.write',
  'company.tax.read',
  'company.tax.write',
  'company.sales_settings.read',
  'company.sales_settings.write',
  'company.document_styles.read',
  'company.document_styles.write',
  'company.purchase_settings.read',
  'company.purchase_settings.write',
  'company.inventory_settings.read',
  'company.inventory_settings.write',
  'company.rental_settings.read',
  'company.rental_settings.write',
  'company.brands.read',
  'company.brands.write',
  'company.locations.read',
  'company.locations.write',
  'company.domains.read',
  'company.domains.write',
  'company.lifecycle.write',
  'company.reset.write',
  'team.people.read',
  'team.people.write',
  'team.jobs.read',
  'team.jobs.write',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PRIVILEGED_KEYS: readonly PermissionKey[] = [
  'team.people.read',
  'team.people.write',
  'team.jobs.read',
  'team.jobs.write',
  'company.lifecycle.write',
  'company.reset.write',
];

export const SCREEN_DEFS: {
  keyPrefix: string;
  label: string;
  href: string;
  module: 'accounting' | 'parties' | 'sales' | 'purchase' | 'inventory' | 'pos' | 'rental' | 'company' | 'team';
  writeable: boolean;
}[] = [
  { keyPrefix: 'accounting.simple_entry', label: 'Simple Entry', href: '/', module: 'accounting', writeable: true },
  { keyPrefix: 'accounting.cashbook', label: 'Cashbook', href: '/cashbook', module: 'accounting', writeable: true },
  { keyPrefix: 'accounting.dashboard', label: 'Dashboard', href: '/dashboard', module: 'accounting', writeable: false },
  { keyPrefix: 'accounting.transactions', label: 'Transactions', href: '/transactions', module: 'accounting', writeable: false },
  { keyPrefix: 'accounting.journal', label: 'Journal', href: '/journal', module: 'accounting', writeable: false },
  { keyPrefix: 'accounting.reports', label: 'Reports', href: '/reports', module: 'accounting', writeable: false },
  { keyPrefix: 'accounting.accounts', label: 'Accounts', href: '/accounts', module: 'accounting', writeable: true },
  { keyPrefix: 'accounting.reconciliation', label: 'Reconciliation', href: '/reconciliation', module: 'accounting', writeable: true },
  { keyPrefix: 'parties.customers', label: 'Customers', href: '/parties/customers', module: 'parties', writeable: true },
  { keyPrefix: 'parties.vendors', label: 'Vendors', href: '/parties/vendors', module: 'parties', writeable: true },
  { keyPrefix: 'sales.quotations', label: 'Quotations', href: '/sales/quotations', module: 'sales', writeable: true },
  { keyPrefix: 'sales.orders', label: 'Sales Orders', href: '/sales/orders', module: 'sales', writeable: true },
  { keyPrefix: 'sales.invoices', label: 'Sales Invoices', href: '/sales/invoices', module: 'sales', writeable: true },
  { keyPrefix: 'sales.payments', label: 'Receive Payments', href: '/sales/payments', module: 'sales', writeable: true },
  { keyPrefix: 'sales.aging', label: 'AR Aging', href: '/sales/aging', module: 'sales', writeable: false },
  { keyPrefix: 'sales.returns', label: 'Sales Returns', href: '/sales/returns', module: 'sales', writeable: true },
  { keyPrefix: 'sales.discounts', label: 'Discounts', href: '/sales/discounts', module: 'sales', writeable: true },
  { keyPrefix: 'pos.terminal', label: 'POS', href: '/pos', module: 'pos', writeable: true },
  { keyPrefix: 'pos.history', label: 'POS History', href: '/sales/pos', module: 'pos', writeable: false },
  { keyPrefix: 'purchase.orders', label: 'Purchase Orders', href: '/purchase/orders', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.receipts', label: 'Goods Received', href: '/purchase/receipts', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.bills', label: 'Purchases', href: '/purchase/purchases', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.expenses', label: 'Cash Purchases', href: '/purchase/expenses', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.import', label: 'Import Purchases', href: '/purchase/import', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.returns', label: 'Purchase Returns', href: '/purchase/returns', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.payments', label: 'Pay Vendors', href: '/purchase/payments', module: 'purchase', writeable: true },
  { keyPrefix: 'purchase.aging', label: 'AP Aging', href: '/purchase/aging', module: 'purchase', writeable: false },
  { keyPrefix: 'inventory.products', label: 'Products', href: '/inventory/products', module: 'inventory', writeable: true },
  { keyPrefix: 'inventory.categories', label: 'Categories', href: '/inventory/categories', module: 'inventory', writeable: true },
  { keyPrefix: 'inventory.levels', label: 'Stock Levels', href: '/inventory/levels', module: 'inventory', writeable: false },
  { keyPrefix: 'inventory.ledger', label: 'Stock Ledger', href: '/inventory/ledger', module: 'inventory', writeable: false },
  { keyPrefix: 'inventory.transfers', label: 'Stock Transfers', href: '/inventory/transfers', module: 'inventory', writeable: true },
  { keyPrefix: 'inventory.adjustments', label: 'Stock Adjustments', href: '/inventory/adjustments', module: 'inventory', writeable: true },
  { keyPrefix: 'rental.calendar', label: 'Rental calendar', href: '/inventory/calendar', module: 'rental', writeable: true },
  { keyPrefix: 'rental.dispatch', label: 'Dispatch / returns', href: '/inventory/on-rent', module: 'rental', writeable: true },
  { keyPrefix: 'company.details', label: 'Company Details', href: '/company/details', module: 'company', writeable: true },
  { keyPrefix: 'company.tax', label: 'Tax Info', href: '/company/tax', module: 'company', writeable: true },
  { keyPrefix: 'company.sales_settings', label: 'Sales Settings', href: '/company/sales', module: 'company', writeable: true },
  { keyPrefix: 'company.document_styles', label: 'Document styles', href: '/company/document-styles', module: 'company', writeable: true },
  { keyPrefix: 'company.purchase_settings', label: 'Purchase Settings', href: '/company/purchase', module: 'company', writeable: true },
  { keyPrefix: 'company.inventory_settings', label: 'Inventory Settings', href: '/company/inventory', module: 'company', writeable: true },
  { keyPrefix: 'company.rental_settings', label: 'Rental Settings', href: '/company/rental', module: 'company', writeable: true },
  { keyPrefix: 'company.brands', label: 'Brands', href: '/company/brands', module: 'company', writeable: true },
  { keyPrefix: 'company.locations', label: 'Locations', href: '/company/locations', module: 'company', writeable: true },
  { keyPrefix: 'company.domains', label: 'Domain Verification', href: '/company/domains', module: 'company', writeable: true },
  { keyPrefix: 'team.people', label: 'Team', href: '/company/team', module: 'team', writeable: true },
  { keyPrefix: 'team.jobs', label: 'Jobs', href: '/company/team/jobs', module: 'team', writeable: true },
];

const HREF_ALIASES: Record<string, string> = {
  '/company/team/groups': 'team.people',
  '/purchase/suppliers': 'parties.vendors',
  '/cashbook/summary': 'accounting.cashbook',
  '/cashbook/settings': 'accounting.cashbook',
  '/cashbook/import': 'accounting.cashbook',
  '/cashbook/import-studio': 'accounting.cashbook',
  '/cashbook/bank-imports': 'accounting.cashbook',
  '/cashbook/match': 'accounting.cashbook',
  '/cashbook/recon': 'accounting.reconciliation',
};

export function isPermissionKey(raw: string): raw is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(raw);
}

export function isPrivilegedKey(key: string): boolean {
  return (PRIVILEGED_KEYS as readonly string[]).includes(key);
}

export function moduleOfKey(key: string): string {
  return key.split('.')[0] ?? '';
}

export function screenKeyFromHref(href: string): string | null {
  const path = href.split('?')[0] ?? href;
  if (HREF_ALIASES[path]) return HREF_ALIASES[path];
  if (path.startsWith('/cashbook/recon')) return 'accounting.reconciliation';
  if (path.startsWith('/inventory/on-rent')) return 'rental.dispatch';
  if (path === '/inventory/levels' || path.startsWith('/inventory/levels')) return 'inventory.levels';
  const exact = SCREEN_DEFS.find((s) => s.href === path);
  if (exact) return exact.keyPrefix;
  const prefix = SCREEN_DEFS.filter((s) => s.href !== '/' && path.startsWith(s.href + '/')).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return prefix?.keyPrefix ?? (path === '/' ? 'accounting.simple_entry' : null);
}

export function navHrefToPermissionPrefix(href: string, label?: string): string | null {
  if (label === 'Documentation') return null;
  if (label === 'Low Stock') return 'inventory.levels';
  if (label === 'On rent') return 'inventory.levels';
  if (label === 'Suppliers') return 'parties.vendors';
  if (label === 'Jobs') return 'team.jobs';
  if (label === 'Groups') return 'team.people';
  return screenKeyFromHref(href);
}

export function writeKey(prefix: string): PermissionKey {
  return `${prefix}.write` as PermissionKey;
}

export function readKey(prefix: string): PermissionKey {
  return `${prefix}.read` as PermissionKey;
}
