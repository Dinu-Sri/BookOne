/**
 * BookOne module registry — four operational modules.
 * Sub-features live under each module in the app routes and nav.
 */

export type ModuleId = 'parties' | 'sales' | 'purchase' | 'inventory';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  features: { id: string; label: string; href: string }[];
}

export const MODULES: ModuleDefinition[] = [
  {
    id: 'parties',
    label: 'Parties',
    description: 'Customers and vendors directory',
    features: [
      { id: 'customers', label: 'Customers', href: '/parties/customers' },
      { id: 'vendors', label: 'Vendors', href: '/parties/vendors' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Quotations through POS and discounts',
    features: [
      { id: 'quotations', label: 'Quotations', href: '/sales/quotations' },
      { id: 'orders', label: 'Sales Orders', href: '/sales/orders' },
      { id: 'invoices', label: 'Sales Invoices', href: '/sales/invoices' },
      { id: 'returns', label: 'Sales Returns', href: '/sales/returns' },
      { id: 'pos', label: 'POS', href: '/sales/pos' },
      { id: 'discounts', label: 'Discounts', href: '/sales/discounts' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    description: 'Orders, local purchases, import purchases, and returns',
    features: [
      { id: 'orders', label: 'Purchase Orders', href: '/purchase/orders' },
      { id: 'purchases', label: 'Purchases', href: '/purchase/purchases' },
      { id: 'import', label: 'Import Purchases', href: '/purchase/import' },
      { id: 'returns', label: 'Purchase Returns', href: '/purchase/returns' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Products, transfers, and adjustments',
    features: [
      { id: 'products', label: 'Products', href: '/inventory/products' },
      { id: 'transfers', label: 'Stock Transfers', href: '/inventory/transfers' },
      { id: 'adjustments', label: 'Stock Adjustments', href: '/inventory/adjustments' },
    ],
  },
];

export function getModule(id: ModuleId): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}
