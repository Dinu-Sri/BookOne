import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ensureLoggedIn } from './auth';
import { expectWorkspace } from './forms';

export async function go(page: Page, path: string) {
  await ensureLoggedIn(page);
  await page.goto(path);
  await expectWorkspace(page);
}

export async function openSuite(page: Page, suiteLabel: string) {
  const trigger = page.locator('.suite-trigger').filter({ hasText: suiteLabel }).first();
  if (await trigger.isVisible().catch(() => false)) {
    const group = trigger.locator('xpath=ancestor::div[contains(@class,"suite-group")]');
    const isOpen = await group.getAttribute('class');
    if (!isOpen?.includes('open')) {
      await trigger.click();
    }
  }
}

export async function clickNav(page: Page, itemLabel: string) {
  await page.locator('.nav-item, a.nav-item').filter({ hasText: itemLabel }).first().click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** All tenant app routes for smoke (excludes control-room, login). */
export const TENANT_SMOKE_ROUTES: { path: string; name: string }[] = [
  { path: '/', name: 'Simple Entry' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/transactions', name: 'Transactions' },
  { path: '/journal', name: 'Journal' },
  { path: '/reports', name: 'Reports' },
  { path: '/accounts', name: 'Accounts' },
  { path: '/reconciliation', name: 'Reconciliation' },
  { path: '/parties/customers', name: 'Customers' },
  { path: '/parties/vendors', name: 'Vendors' },
  { path: '/parties/customers/new', name: 'New customer' },
  { path: '/parties/vendors/new', name: 'New vendor' },
  { path: '/sales/quotations', name: 'Quotations' },
  { path: '/sales/quotations/new', name: 'New quotation' },
  { path: '/sales/orders', name: 'Sales orders' },
  { path: '/sales/orders/new', name: 'New sales order' },
  { path: '/sales/invoices', name: 'Sales invoices' },
  { path: '/sales/invoices/new', name: 'New sales invoice' },
  { path: '/sales/payments', name: 'Sales payments' },
  { path: '/sales/payments/new', name: 'Receive payments' },
  { path: '/sales/aging', name: 'AR aging' },
  { path: '/sales/returns', name: 'Sales returns' },
  { path: '/sales/returns/new', name: 'New sales return' },
  { path: '/sales/discounts', name: 'Discounts' },
  { path: '/sales/discounts/new', name: 'New discount' },
  { path: '/sales/pos', name: 'POS history' },
  { path: '/sales/pos/shifts', name: 'POS shifts' },
  { path: '/pos', name: 'POS terminal' },
  { path: '/purchase/orders', name: 'Purchase orders' },
  { path: '/purchase/orders/new', name: 'New PO' },
  { path: '/purchase/receipts', name: 'GRN list' },
  { path: '/purchase/receipts/new', name: 'New GRN' },
  { path: '/purchase/purchases', name: 'Purchases' },
  { path: '/purchase/purchases/new', name: 'New purchase' },
  { path: '/purchase/import', name: 'Import purchases' },
  { path: '/purchase/import/new', name: 'New import' },
  { path: '/purchase/expenses', name: 'Cash purchases' },
  { path: '/purchase/expenses/new', name: 'New cash purchase' },
  { path: '/purchase/returns', name: 'Purchase returns' },
  { path: '/purchase/returns/new', name: 'New purchase return' },
  { path: '/purchase/payments', name: 'Pay vendors' },
  { path: '/purchase/payments/new', name: 'New vendor payment' },
  { path: '/purchase/aging', name: 'AP aging' },
  { path: '/purchase/suppliers', name: 'Suppliers' },
  { path: '/inventory/products', name: 'Products' },
  { path: '/inventory/products/new', name: 'New product' },
  { path: '/inventory/levels', name: 'Stock levels' },
  { path: '/inventory/ledger', name: 'Stock ledger' },
  { path: '/inventory/transfers', name: 'Transfers' },
  { path: '/inventory/transfers/new', name: 'New transfer' },
  { path: '/inventory/adjustments', name: 'Adjustments' },
  { path: '/inventory/adjustments/new', name: 'New adjustment' },
  { path: '/company/details', name: 'Company details' },
  { path: '/company/tax', name: 'Tax' },
  { path: '/company/sales', name: 'Sales settings' },
  { path: '/company/purchase', name: 'Purchase settings' },
  { path: '/company/inventory', name: 'Inventory settings' },
  { path: '/company/brands', name: 'Brands' },
  { path: '/company/locations', name: 'Locations' },
  { path: '/company/domains', name: 'Domains' },
];

export const PUBLIC_SMOKE_ROUTES = [
  { path: '/docs', name: 'Docs home' },
  { path: '/docs/getting-started', name: 'Docs getting started' },
  { path: '/docs/sales', name: 'Docs sales' },
  { path: '/docs/purchase', name: 'Docs purchase' },
  { path: '/docs/inventory', name: 'Docs inventory' },
  { path: '/docs/accounting', name: 'Docs accounting' },
  { path: '/docs/pos', name: 'Docs POS' },
  { path: '/e2e', name: 'E2E console' },
  { path: '/login', name: 'Login' },
];

export const PLATFORM_ROUTES = [
  '/control-room',
  '/control-room/companies',
  '/control-room/companies/new',
  '/control-room/modules',
  '/control-room/access',
  '/control-room/audit',
  '/control-room/health-check',
];
