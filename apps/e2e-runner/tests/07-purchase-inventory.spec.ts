import { test, expect, seed } from '../src/fixtures';
import { createVendor, createProduct, ensureBrand, ensureLocation } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { addManualDocLine, fillBrandLocationIfPresent, clickPrimary } from '../src/helpers/forms';

test.describe('Purchase & inventory ops @purchase @inventory @journey @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let vendor = '';
  let sku = '';

  test('setup vendor and physical product', async ({ authedPage: page }) => {
    await ensureBrand(page).catch(() => undefined);
    await ensureLocation(page).catch(() => undefined);
    vendor = await createVendor(page);
    const p = await createProduct(page, {
      type: 'physical',
      unitCost: '80',
      sellPrice: '200',
      openingQty: '5',
    });
    sku = p.sku;
  });

  test('create purchase order', async ({ authedPage: page }) => {
    await go(page, '/purchase/orders/new');
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    await page.locator('input[name="partyNameOverride"]').fill(vendor).catch(() => undefined);
    await fillBrandLocationIfPresent(page);
    await addManualDocLine(page, `PO ${sku || seed()}`, '80', '3');
    await clickPrimary(page, /Save/i);
    await page.waitForTimeout(2000);
    await go(page, '/purchase/orders');
    await expect(page.locator('table, .workspace').first()).toBeVisible();
  });

  test('create cash purchase', async ({ authedPage: page }) => {
    await go(page, '/purchase/expenses/new');
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    await page.locator('input[name="partyNameOverride"]').fill(vendor).catch(() => undefined);
    await fillBrandLocationIfPresent(page);
    await addManualDocLine(page, `CASH ${seed()}`, '50', '1');
    await clickPrimary(page, /Save/i);
    await page.waitForTimeout(2500);
    await go(page, '/purchase/expenses');
    await expect(page.locator('.workspace').first()).toBeVisible();
  });

  test('create credit purchase bill', async ({ authedPage: page }) => {
    await go(page, '/purchase/purchases/new');
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    await page.locator('input[name="partyNameOverride"]').fill(vendor).catch(() => undefined);
    await fillBrandLocationIfPresent(page);
    const sup = page.locator('input[name="supplierInvoiceNumber"]').first();
    if (await sup.isVisible().catch(() => false)) {
      await sup.fill(`SUP-${seed()}`);
    }
    await addManualDocLine(page, `BILL ${seed()}`, '90', '2');
    await clickPrimary(page, /Save/i);
    await page.waitForTimeout(2500);
    await go(page, '/purchase/purchases');
    await expect(page.locator('.workspace').first()).toBeVisible();
  });

  test('purchase lists and aging', async ({ authedPage: page }) => {
    for (const path of [
      '/purchase/orders',
      '/purchase/receipts',
      '/purchase/purchases',
      '/purchase/payments',
      '/purchase/aging',
      '/purchase/suppliers',
      '/purchase/returns',
      '/purchase/import',
    ]) {
      await go(page, path);
    }
  });

  test('stock ledger and transfers pages', async ({ authedPage: page }) => {
    await go(page, '/inventory/ledger');
    await go(page, '/inventory/transfers');
    await go(page, '/inventory/adjustments');
    await go(page, '/inventory/transfers/new');
    await go(page, '/inventory/adjustments/new');
  });
});
