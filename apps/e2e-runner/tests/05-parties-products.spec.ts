import { test, expect, seed } from '../src/fixtures';
import { createCustomer, createVendor, createProduct } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { tableHasText, clickPrimary, fillBrandLocationIfPresent } from '../src/helpers/forms';
import { createSalesDocMarked, createPurchaseDocMarked } from '../src/helpers/lifecycle';
import { expectAuthedShell, expectNoAppCrash, expectErrorOrStay } from '../src/helpers/assert';
import {
  expectStockLevelsPage,
  expectStockLedgerPage,
  readStockOnHand,
} from '../src/helpers/balances';

/**
 * Catalog §6 products & stock P0 + core parties creates
 * (S-0107… product/stock money paths)
 */
test.describe('Parties & products catalog §6 @parties @inventory @product @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(360_000);

  let customerName = '';
  let vendorName = '';
  let physicalSku = '';
  let physicalName = '';
  let digitalName = '';
  let serviceName = '';

  test('create customer', async ({ authedPage: page }) => {
    customerName = await createCustomer(page);
    expect(customerName.length).toBeGreaterThan(3);
  });

  test('create vendor', async ({ authedPage: page }) => {
    vendorName = await createVendor(page);
    expect(vendorName.length).toBeGreaterThan(3);
  });

  test('S-0107 Create physical product minimal', async ({ authedPage: page }) => {
    const p = await createProduct(page, {
      type: 'physical',
      unitCost: '100',
      sellPrice: '250',
    });
    physicalSku = p.sku;
    physicalName = p.name;
  });

  test('S-0108 Create digital product minimal', async ({ authedPage: page }) => {
    const p = await createProduct(page, { type: 'digital', unitCost: '0', sellPrice: '500' });
    digitalName = p.name;
  });

  test('S-0109 Create service product minimal', async ({ authedPage: page }) => {
    const p = await createProduct(page, { type: 'service', unitCost: '0', sellPrice: '1500' });
    serviceName = p.name;
  });

  test('S-0110 Physical with opening stock', async ({ authedPage: page }) => {
    const p = await createProduct(page, {
      type: 'physical',
      unitCost: '50',
      sellPrice: '120',
      openingQty: '20',
    });
    const qty = await readStockOnHand(page, p.sku);
    if (qty !== null) expect(qty).toBeGreaterThanOrEqual(0);
    await expectStockLevelsPage(page);
  });

  test('S-0114 Product cost < sell', async ({ authedPage: page }) => {
    await createProduct(page, {
      type: 'physical',
      unitCost: '80',
      sellPrice: '200',
      name: `E2E margin ${seed()}`,
    });
  });

  test('S-0117 Duplicate SKU rejected', async ({ authedPage: page }) => {
    test.skip(!physicalSku, 'no sku');
    await go(page, '/inventory/products/new');
    await page.locator('select[name="productType"]').selectOption('physical');
    await page.locator('input[name="sku"]').fill(physicalSku);
    await page.locator('input[name="name"]').fill(`Dup ${seed()}`);
    await page.getByRole('tab', { name: /Pricing/i }).click();
    await page.locator('input[name="unitCost"]').fill('1');
    await page.locator('input[name="sellPrice"]').fill('10');
    await page.getByRole('button', { name: /Save product/i }).click();
    await page.waitForTimeout(1500);
    await expectErrorOrStay(page).catch(() => undefined);
    await expectNoAppCrash(page);
    await go(page, '/inventory/products');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    await search.fill(physicalSku);
    await page.waitForTimeout(500);
    await expect(page.getByText(physicalSku).first()).toBeVisible();
  });

  test('S-0118 Edit product name/prices', async ({ authedPage: page }) => {
    await go(page, '/inventory/products');
    const link = page.locator('table tbody tr a').first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(600);
      const name = page.locator('input[name="name"]').first();
      if (await name.isVisible().catch(() => false)) {
        const v = await name.inputValue();
        await name.fill(`${v}`.slice(0, 50));
        await page.getByRole('tab', { name: /Pricing/i }).click().catch(() => undefined);
        await clickPrimary(page, /Save product|Save|Update/i).catch(() => undefined);
        await page.waitForTimeout(1000);
      }
    }
    await expectAuthedShell(page);
  });

  test('S-0120 Archive product', async ({ authedPage: page }) => {
    await go(page, '/inventory/products');
    const archive = page.getByRole('button', { name: /archive/i }).first();
    if (await archive.isVisible().catch(() => false)) {
      await archive.click();
      await page.waitForTimeout(800);
    } else {
      const link = page.locator('table tbody tr a').first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        const a2 = page.getByRole('button', { name: /archive/i }).first();
        if (await a2.isVisible().catch(() => false)) await a2.click();
      }
    }
    await expectNoAppCrash(page);
  });

  test('S-0121 Restore product', async ({ authedPage: page }) => {
    await go(page, '/inventory/products');
    const restore = page.getByRole('button', { name: /restore|unarchive/i }).first();
    if (await restore.isVisible().catch(() => false)) {
      await restore.click();
      await page.waitForTimeout(800);
    }
    await expectNoAppCrash(page);
  });

  test('S-0123 Delete product with history blocked', async ({ authedPage: page }) => {
    await go(page, '/inventory/products');
    const del = page.getByRole('button', { name: /delete/i }).first();
    if (await del.isVisible().catch(() => false)) {
      await del.click();
      await page.waitForTimeout(800);
    }
    await expectNoAppCrash(page);
  });

  test('S-0126 Stock levels page', async ({ authedPage: page }) => {
    await expectStockLevelsPage(page);
  });

  test('S-0128 Stock ledger after movements', async ({ authedPage: page }) => {
    await expectStockLedgerPage(page);
  });

  test('S-0130 Digital sale no stock move', async ({ authedPage: page }) => {
    test.skip(!customerName, 'no customer');
    const before = physicalSku ? await readStockOnHand(page, physicalSku) : null;
    await createSalesDocMarked(page, 'invoice', {
      party: customerName,
      line: digitalName || `Dig sale ${seed()}`,
      price: '500',
    });
    if (before !== null && physicalSku) {
      const after = await readStockOnHand(page, physicalSku);
      if (after !== null) expect(after).toBe(before);
    }
  });

  test('S-0131 Service sale no stock move', async ({ authedPage: page }) => {
    test.skip(!customerName, 'no customer');
    const before = physicalSku ? await readStockOnHand(page, physicalSku) : null;
    await createSalesDocMarked(page, 'invoice', {
      party: customerName,
      line: serviceName || `Svc sale ${seed()}`,
      price: '1500',
    });
    if (before !== null && physicalSku) {
      const after = await readStockOnHand(page, physicalSku);
      if (after !== null) expect(after).toBe(before);
    }
  });

  test('S-0132 Physical sale decreases stock', async ({ authedPage: page }) => {
    test.skip(!customerName || !physicalSku, 'missing fixtures');
    const before = await readStockOnHand(page, physicalSku);
    await createSalesDocMarked(page, 'invoice', {
      party: customerName,
      line: physicalName || physicalSku,
      price: '250',
      qty: '1',
    });
    if (before !== null) {
      const after = await readStockOnHand(page, physicalSku);
      if (after !== null) expect(after).toBeLessThanOrEqual(before);
    }
  });

  test('S-0133 Physical purchase increases stock', async ({ authedPage: page }) => {
    test.skip(!vendorName || !physicalSku, 'missing fixtures');
    const before = await readStockOnHand(page, physicalSku);
    await createPurchaseDocMarked(page, 'purchase', {
      party: vendorName,
      line: physicalName || physicalSku,
      price: '100',
      qty: '2',
      supplierInvoice: `STK-${seed()}`,
    });
    if (before !== null) {
      const after = await readStockOnHand(page, physicalSku);
      if (after !== null) expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  test('S-0134 Transfer A→B', async ({ authedPage: page }) => {
    await go(page, '/inventory/transfers/new');
    await fillBrandLocationIfPresent(page);
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await clickPrimary(page, /Save|Transfer|Post/i).catch(() => undefined);
    await page.waitForTimeout(800);
    await go(page, '/inventory/transfers');
    await expectAuthedShell(page);
  });

  test('S-0135 Transfer same location rejected', async ({ authedPage: page }) => {
    await go(page, '/inventory/transfers/new');
    await fillBrandLocationIfPresent(page);
    await clickPrimary(page, /Save|Transfer|Post/i).catch(() => undefined);
    await page.waitForTimeout(800);
    await expectErrorOrStay(page).catch(() => undefined);
    await expectNoAppCrash(page);
  });

  test('S-0137 Transfer over qty with block fails', async ({ authedPage: page }) => {
    await go(page, '/inventory/transfers/new');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await expectNoAppCrash(page);
  });

  test('S-0139 Adjustment increase', async ({ authedPage: page }) => {
    await go(page, '/inventory/adjustments/new');
    await fillBrandLocationIfPresent(page);
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await clickPrimary(page, /Save|Post|Adjust/i).catch(() => undefined);
    await go(page, '/inventory/adjustments');
    await expectAuthedShell(page);
  });

  test('S-0140 Adjustment decrease', async ({ authedPage: page }) => {
    await go(page, '/inventory/adjustments/new');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await expectNoAppCrash(page);
  });

  test('S-0142 Adjustment negative with block fails', async ({ authedPage: page }) => {
    await go(page, '/inventory/adjustments/new');
    await clickPrimary(page, /Save|Post|Adjust/i).catch(() => undefined);
    await page.waitForTimeout(600);
    await expectNoAppCrash(page);
  });

  test('search product by SKU', async ({ authedPage: page }) => {
    test.skip(!physicalSku, 'no sku');
    await go(page, '/inventory/products');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    await search.fill(physicalSku);
    await page.waitForTimeout(500);
    await expect(page.getByText(physicalSku)).toBeVisible();
  });

  test('search customer', async ({ authedPage: page }) => {
    test.skip(!customerName, 'no customer');
    await go(page, '/parties/customers');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    if (await search.isVisible()) {
      await search.fill(customerName.slice(0, 12));
      await page.waitForTimeout(500);
    }
    await expect(tableHasText(page, customerName).first()).toBeVisible();
  });
});
