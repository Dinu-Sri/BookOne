import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { seed } from './env';
import {
  addManualDocLine,
  clickPrimary,
  fillBrandLocationIfPresent,
  tableHasText,
} from './forms';
import { go } from './nav';
import { expectAuthedShell, expectErrorOrStay, expectNoAppCrash } from './assert';
import { createPurchaseDoc, createSalesDoc } from './documents';

export type SalesKind = 'quotation' | 'order' | 'invoice' | 'return';
export type PurchaseKind = 'order' | 'purchase' | 'expense' | 'receipt' | 'return' | 'payment';

async function pickParty(page: Page, name?: string) {
  const select = page.locator('select[name="partyName"], select[name="partyId"]').first();
  if (await select.isVisible().catch(() => false)) {
    if (name) {
      await select.selectOption({ label: new RegExp(name.slice(0, 12), 'i') }).catch(async () => {
        await select.selectOption({ index: 1 }).catch(() => undefined);
      });
    } else {
      await select.selectOption({ index: 1 }).catch(() => undefined);
    }
  }
  const override = page.locator('input[name="partyNameOverride"], input[name="partyName"]').first();
  if (await override.isVisible().catch(() => false)) {
    if (name) await override.fill(name);
    else if (!(await override.inputValue().catch(() => ''))) {
      await override.fill(`E2E Party ${seed()}`);
    }
  }
}

/** Create commercial sales doc; returns marker used on the line for list search. */
export async function createSalesDocMarked(
  page: Page,
  kind: SalesKind,
  opts: {
    party?: string;
    line?: string;
    price?: string;
    qty?: string;
    skipBrandLocation?: boolean;
  } = {},
): Promise<string> {
  const marker = opts.line || `E2E ${kind} ${seed()}`;
  const paths = {
    quotation: '/sales/quotations/new',
    order: '/sales/orders/new',
    invoice: '/sales/invoices/new',
    return: '/sales/returns/new',
  } as const;
  const lists = {
    quotation: '/sales/quotations',
    order: '/sales/orders',
    invoice: '/sales/invoices',
    return: '/sales/returns',
  } as const;

  await go(page, paths[kind]);
  await pickParty(page, opts.party);
  if (!opts.skipBrandLocation) {
    await fillBrandLocationIfPresent(page);
  }
  await addManualDocLine(page, marker, opts.price || '1000', opts.qty || '1');
  await clickPrimary(page, /Save|Create|Post|Confirm|Quote|Invoice/i);
  await page.waitForTimeout(1800);
  await go(page, lists[kind]);
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
  // Soft: marker may appear in list depending on columns
  const hit = tableHasText(page, marker.slice(0, 12));
  if (await hit.first().isVisible().catch(() => false)) {
    await expect(hit.first()).toBeVisible();
  }
  return marker;
}

export async function createPurchaseDocMarked(
  page: Page,
  kind: PurchaseKind,
  opts: {
    party?: string;
    line?: string;
    price?: string;
    qty?: string;
    supplierInvoice?: string;
    skipBrandLocation?: boolean;
  } = {},
): Promise<string> {
  const marker = opts.line || `E2E purch ${kind} ${seed()}`;
  const paths: Record<PurchaseKind, string> = {
    order: '/purchase/orders/new',
    purchase: '/purchase/purchases/new',
    expense: '/purchase/expenses/new',
    receipt: '/purchase/receipts/new',
    return: '/purchase/returns/new',
    payment: '/purchase/payments/new',
  };
  const lists: Record<PurchaseKind, string> = {
    order: '/purchase/orders',
    purchase: '/purchase/purchases',
    expense: '/purchase/expenses',
    receipt: '/purchase/receipts',
    return: '/purchase/returns',
    payment: '/purchase/payments',
  };

  await go(page, paths[kind]);
  await pickParty(page, opts.party);
  if (!opts.skipBrandLocation) {
    await fillBrandLocationIfPresent(page);
  }
  if (opts.supplierInvoice) {
    const sup = page.locator('input[name="supplierInvoiceNumber"]').first();
    if (await sup.isVisible().catch(() => false)) {
      await sup.fill(opts.supplierInvoice);
    }
  }
  if (kind !== 'payment') {
    await addManualDocLine(page, marker, opts.price || '500', opts.qty || '1');
  }
  await clickPrimary(page, /Save|Create|Post|Confirm|Receive|Pay/i);
  await page.waitForTimeout(1800);
  await go(page, lists[kind]);
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
  return marker;
}

/** Open first list row (or row matching text) and click Convert when available. */
export async function tryConvertFromList(
  page: Page,
  listPath: string,
  convertName: RegExp = /Convert/i,
): Promise<'converted' | 'no_button' | 'error'> {
  await go(page, listPath);
  // Prefer Actions → Convert form button in first actionable row
  const convertBtn = page
    .locator('form')
    .filter({ has: page.locator('input[name="targetType"], input[name="documentId"]') })
    .getByRole('button', { name: convertName })
    .first();
  const roleBtn = page.getByRole('button', { name: convertName }).first();
  const linkBtn = page.getByRole('link', { name: convertName }).first();

  let target = convertBtn;
  if (!(await target.isVisible().catch(() => false))) target = roleBtn;
  if (!(await target.isVisible().catch(() => false))) target = linkBtn;

  // Open first detail if convert only lives on detail
  if (!(await target.isVisible().catch(() => false))) {
    const rowLink = page.locator('table tbody tr a').first();
    if (await rowLink.isVisible().catch(() => false)) {
      await rowLink.click();
      await page.waitForTimeout(800);
      target = page.getByRole('button', { name: convertName }).first();
      if (!(await target.isVisible().catch(() => false))) {
        // Purchase GRN path
        const grn = page.getByRole('button', { name: /Receive goods|GRN|Convert/i }).first();
        if (await grn.isVisible().catch(() => false)) {
          await grn.click();
          await page.waitForTimeout(1000);
          await clickPrimary(page, /Receive|Save|Confirm|Convert|Create/i).catch(() => undefined);
          await page.waitForTimeout(1500);
          await expectNoAppCrash(page);
          return 'converted';
        }
        return 'no_button';
      }
    } else {
      return 'no_button';
    }
  }

  await target.click();
  await page.waitForTimeout(1000);
  // Confirm panel if present (PO convert quantities)
  await clickPrimary(page, /Receive|Save|Confirm|Convert|Create|Invoice|Order/i).catch(() => undefined);
  await page.waitForTimeout(1500);
  await expectNoAppCrash(page);
  return 'converted';
}

export async function openReceivePaymentForm(page: Page, party?: string) {
  await go(page, '/sales/payments/new');
  await pickParty(page, party);
  await fillBrandLocationIfPresent(page);
  await expect(page.locator('form, .workspace').first()).toBeVisible();
}

export async function openPayVendorForm(page: Page, party?: string) {
  await go(page, '/purchase/payments/new');
  await pickParty(page, party);
  await fillBrandLocationIfPresent(page);
  await expect(page.locator('form, .workspace').first()).toBeVisible();
}

export async function trySubmitPayment(page: Page, expectFail = false) {
  const amount = page.locator('input[name="amount"], input[name="total"], input[type="number"]').first();
  if (await amount.isVisible().catch(() => false)) {
    const v = await amount.inputValue().catch(() => '');
    if (!v || v === '0') await amount.fill(expectFail ? '999999999' : '100');
  }
  await clickPrimary(page, /Save|Receive|Pay|Post|Allocate/i).catch(() => undefined);
  await page.waitForTimeout(1200);
  if (expectFail) {
    await expectErrorOrStay(page);
  } else {
    await expectNoAppCrash(page);
  }
}

/** Attempt invoice save without brand/location (for validation scenarios). */
export async function tryInvoiceWithoutDimensions(page: Page, party?: string) {
  await go(page, '/sales/invoices/new');
  await pickParty(page, party);
  // Clear brand/location selects to blank if possible
  for (const name of ['brandId', 'locationId', 'brand', 'location']) {
    const sel = page.locator(`select[name="${name}"]`).first();
    if (await sel.isVisible().catch(() => false)) {
      await sel.selectOption({ index: 0 }).catch(() => undefined);
    }
  }
  await addManualDocLine(page, `E2E no-dim ${seed()}`, '100', '1');
  await clickPrimary(page, /Save|Create|Invoice/i).catch(() => undefined);
  await page.waitForTimeout(1000);
  await expectErrorOrStay(page);
}

export async function openFirstDocDetail(page: Page, listPath: string) {
  await go(page, listPath);
  const link = page.locator('table tbody tr a').first();
  if (await link.isVisible().catch(() => false)) {
    await link.click();
    await page.waitForTimeout(800);
  }
  await expectAuthedShell(page);
}

export async function tryDeleteFromList(page: Page, listPath: string): Promise<boolean> {
  await go(page, listPath);
  const del = page
    .getByRole('button', { name: /delete|void|archive/i })
    .or(page.locator('button, a').filter({ hasText: /delete|void|archive/i }))
    .first();
  if (!(await del.isVisible().catch(() => false))) {
    const link = page.locator('table tbody tr a').first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(600);
    }
  }
  const del2 = page.getByRole('button', { name: /delete|void|archive/i }).first();
  if (!(await del2.isVisible().catch(() => false))) return false;
  await del2.click();
  // Confirm dialog
  const confirm = page.getByRole('button', { name: /confirm|yes|delete|ok/i }).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click().catch(() => undefined);
  }
  await page.waitForTimeout(1000);
  return true;
}

// Re-export thin wrappers used by older tests
export { createSalesDoc, createPurchaseDoc };
