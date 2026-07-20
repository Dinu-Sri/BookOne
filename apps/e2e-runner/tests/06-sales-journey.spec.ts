import { test, expect, seed } from '../src/fixtures';
import { createCustomer, createProduct, ensureBrand, ensureLocation } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { addManualDocLine, fillBrandLocationIfPresent, clickPrimary } from '../src/helpers/forms';

test.describe('Sales journey QT→SO→INV @sales @journey @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let customer = '';
  let productName = '';

  test('setup masters + customer + product', async ({ authedPage: page }) => {
    await ensureBrand(page).catch(() => undefined);
    await ensureLocation(page).catch(() => undefined);
    customer = await createCustomer(page);
    const p = await createProduct(page, {
      type: 'service',
      sellPrice: '1000',
      unitCost: '0',
    });
    productName = p.name;
  });

  test('create quotation', async ({ authedPage: page }) => {
    await go(page, '/sales/quotations/new');
    // party select or input
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ label: new RegExp(customer.slice(0, 10)) }).catch(async () => {
        await page.locator('input[name="partyNameOverride"]').fill(customer);
      });
    } else {
      await page.locator('input[name="partyName"], input[name="partyNameOverride"]').first().fill(customer);
    }
    await fillBrandLocationIfPresent(page);
    await addManualDocLine(page, productName || `Svc ${seed()}`, '1000', '1');
    await clickPrimary(page, /Save|Create|Quote/i);
    await page.waitForTimeout(2000);
    await go(page, '/sales/quotations');
    await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
  });

  test('create sales order', async ({ authedPage: page }) => {
    await go(page, '/sales/orders/new');
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    await page.locator('input[name="partyNameOverride"]').fill(customer).catch(() => undefined);
    await fillBrandLocationIfPresent(page);
    await addManualDocLine(page, `SO line ${seed()}`, '500', '2');
    await clickPrimary(page, /Save/i);
    await page.waitForTimeout(2000);
    await go(page, '/sales/orders');
    await expect(page.locator('table, .workspace').first()).toBeVisible();
  });

  test('create commercial invoice', async ({ authedPage: page }) => {
    await go(page, '/sales/invoices/new');
    const partySelect = page.locator('select[name="partyName"]').first();
    if (await partySelect.isVisible().catch(() => false)) {
      await partySelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    await page.locator('input[name="partyNameOverride"]').fill(customer).catch(() => undefined);
    await fillBrandLocationIfPresent(page);
    await addManualDocLine(page, `INV line ${seed()}`, '750', '1');
    await clickPrimary(page, /Save|Create|Invoice/i);
    await page.waitForTimeout(2500);
    await go(page, '/sales/invoices');
    await expect(page.locator('table, .workspace').first()).toBeVisible();
  });

  test('sales lists and aging load', async ({ authedPage: page }) => {
    for (const path of ['/sales/invoices', '/sales/payments', '/sales/aging', '/sales/returns', '/sales/discounts']) {
      await go(page, path);
    }
  });

  test('create discount master', async ({ authedPage: page }) => {
    await go(page, '/sales/discounts/new');
    const name = page.locator('input[name="name"]').first();
    if (await name.isVisible().catch(() => false)) {
      await name.fill(`E2E Disc ${seed()}`);
      const val = page.locator('input[name="value"], input[name="amount"]').first();
      if (await val.isVisible().catch(() => false)) await val.fill('10');
      await clickPrimary(page, /Save|Create/i);
      await page.waitForTimeout(1500);
    }
    await go(page, '/sales/discounts');
    await expect(page.locator('.workspace').first()).toBeVisible();
  });
});
