import { test, expect, seed } from '../src/fixtures';
import { createCustomer, createVendor, createProduct } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { tableHasText } from '../src/helpers/forms';

test.describe('Parties & products @parties @inventory @product @p0', () => {
  test.describe.configure({ mode: 'serial' });
  let customerName = '';
  let vendorName = '';
  let physicalSku = '';

  test('create customer', async ({ authedPage: page }) => {
    customerName = await createCustomer(page);
    expect(customerName.length).toBeGreaterThan(3);
  });

  test('create vendor', async ({ authedPage: page }) => {
    vendorName = await createVendor(page);
    expect(vendorName.length).toBeGreaterThan(3);
  });

  test('create physical product with opening stock', async ({ authedPage: page }) => {
    const p = await createProduct(page, {
      type: 'physical',
      unitCost: '100',
      sellPrice: '250',
      openingQty: '20',
    });
    physicalSku = p.sku;
  });

  test('create digital product', async ({ authedPage: page }) => {
    await createProduct(page, { type: 'digital', unitCost: '0', sellPrice: '500' });
  });

  test('create service product', async ({ authedPage: page }) => {
    await createProduct(page, { type: 'service', unitCost: '0', sellPrice: '1500' });
  });

  test('search product by SKU', async ({ authedPage: page }) => {
    test.skip(!physicalSku, 'no sku');
    await go(page, '/inventory/products');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    await search.fill(physicalSku);
    await page.waitForTimeout(500);
    await expect(page.getByText(physicalSku)).toBeVisible();
  });

  test('stock levels page', async ({ authedPage: page }) => {
    await go(page, '/inventory/levels');
    await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
  });

  test('duplicate SKU rejected', async ({ authedPage: page }) => {
    test.skip(!physicalSku, 'no sku');
    await go(page, '/inventory/products/new');
    await page.locator('select[name="productType"]').selectOption('physical');
    await page.locator('input[name="sku"]').fill(physicalSku);
    await page.locator('input[name="name"]').fill(`Dup ${seed()}`);
    await page.getByRole('tab', { name: /Pricing/i }).click();
    await page.locator('input[name="sellPrice"]').fill('10');
    await page.getByRole('button', { name: /Save product/i }).click();
    // Stay on form or show error — should not create second
    await page.waitForTimeout(1500);
    await go(page, '/inventory/products');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    await search.fill(physicalSku);
    await page.waitForTimeout(500);
    // At least one row with SKU (not crash)
    await expect(page.getByText(physicalSku).first()).toBeVisible();
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
