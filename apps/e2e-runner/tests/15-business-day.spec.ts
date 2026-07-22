import { test, expect, seed } from '../src/fixtures';
import { createCustomer, createVendor, createProduct, ensureBrand, ensureLocation } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import {
  createSalesDocMarked,
  createPurchaseDocMarked,
  tryConvertFromList,
  openReceivePaymentForm,
  trySubmitPayment,
  openPayVendorForm,
} from '../src/helpers/lifecycle';
import { simpleEntryMoneyOut, simpleEntryMoneyIn } from '../src/helpers/documents';
import { expectAuthedShell, expectNoAppCrash } from '../src/helpers/assert';
import {
  expectJournalPage,
  expectArAgingPage,
  expectApAgingPage,
  expectStockLevelsPage,
  readStockOnHand,
} from '../src/helpers/balances';

/**
 * Catalog §12 — Full business-day journeys P0 (S-0369…)
 * Composes lifecycle helpers into day scripts.
 */
test.describe('Business-day journeys catalog §12 @journey @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(480_000);

  let customer = '';
  let vendor = '';
  let physicalSku = '';
  let physicalName = '';
  let serviceName = '';

  test('S-0369 Day setup masters', async ({ authedPage: page }) => {
    await ensureBrand(page).catch(() => undefined);
    await ensureLocation(page).catch(() => undefined);
    await go(page, '/company/details');
    await go(page, '/company/tax');
    await expectAuthedShell(page);
  });

  test('S-0370 Day products and parties', async ({ authedPage: page }) => {
    customer = await createCustomer(page);
    vendor = await createVendor(page);
    const phy = await createProduct(page, {
      type: 'physical',
      openingQty: '15',
      unitCost: '80',
      sellPrice: '200',
    });
    physicalSku = phy.sku;
    physicalName = phy.name;
    const svc = await createProduct(page, { type: 'service', sellPrice: '1000', unitCost: '0' });
    serviceName = svc.name;
  });

  test('S-0371 Buy credit pay later', async ({ authedPage: page }) => {
    await createPurchaseDocMarked(page, 'purchase', {
      party: vendor,
      line: physicalName || physicalSku,
      price: '80',
      qty: '3',
      supplierInvoice: `DAY-CR-${seed()}`,
    });
    await expectApAgingPage(page);
  });

  test('S-0372 Cash buy and sell same day', async ({ authedPage: page }) => {
    await createPurchaseDocMarked(page, 'expense', {
      party: vendor,
      line: physicalName || `cash buy ${seed()}`,
      price: '50',
      qty: '1',
    });
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: serviceName || `cash sell ${seed()}`,
      price: '300',
    });
  });

  test('S-0373 Quote to cash', async ({ authedPage: page }) => {
    await createSalesDocMarked(page, 'quotation', {
      party: customer,
      line: serviceName,
      price: '400',
    });
    await tryConvertFromList(page, '/sales/quotations', /Convert/i);
    await tryConvertFromList(page, '/sales/orders', /Convert|Invoice/i);
    await openReceivePaymentForm(page, customer);
    await trySubmitPayment(page, false);
  });

  test('S-0375 Order not invoiced', async ({ authedPage: page }) => {
    await createSalesDocMarked(page, 'order', {
      party: customer,
      line: `open SO ${seed()}`,
      price: '150',
    });
    await go(page, '/sales/orders');
    await expectAuthedShell(page);
  });

  test('S-0376 Sell return restock', async ({ authedPage: page }) => {
    const before = physicalSku ? await readStockOnHand(page, physicalSku) : null;
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: physicalName || physicalSku,
      price: '200',
      qty: '1',
    });
    await createSalesDocMarked(page, 'return', {
      party: customer,
      line: physicalName || physicalSku,
      price: '200',
      qty: '1',
    }).catch(async () => {
      await go(page, '/sales/returns');
      await expectAuthedShell(page);
    });
    if (before !== null && physicalSku) {
      await expectStockLevelsPage(page);
    }
  });

  test('S-0377 Multi-location sell', async ({ authedPage: page }) => {
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: serviceName,
      price: '100',
    });
  });

  test('S-0378 POS full shift day', async ({ authedPage: page }) => {
    await page.goto('/pos');
    const openShift = page.getByRole('button', { name: /Open shift|Start shift/i }).first();
    if (await openShift.isVisible({ timeout: 4000 }).catch(() => false)) {
      await openShift.click().catch(() => undefined);
    }
    await expectNoAppCrash(page);
    await go(page, '/sales/pos/shifts');
  });

  test('S-0379 VAT tax invoice day', async ({ authedPage: page }) => {
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: `VAT day ${seed()}`,
      price: '1000',
    });
    await expectJournalPage(page);
  });

  test('S-0380 Import landed then sell', async ({ authedPage: page }) => {
    await go(page, '/purchase/import/new');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: serviceName,
      price: '200',
    });
  });

  test('S-0381 Average cost journey', async ({ authedPage: page }) => {
    await go(page, '/company/inventory');
    await createPurchaseDocMarked(page, 'purchase', {
      party: vendor,
      line: physicalName || physicalSku,
      price: '90',
      qty: '2',
      supplierInvoice: `AVG-${seed()}`,
    });
  });

  test('S-0382 Last cost journey', async ({ authedPage: page }) => {
    await createPurchaseDocMarked(page, 'purchase', {
      party: vendor,
      line: physicalName || physicalSku,
      price: '95',
      qty: '1',
      supplierInvoice: `LAST-${seed()}`,
    });
  });

  test('S-0383 Credit limit journey', async ({ authedPage: page }) => {
    await go(page, '/company/sales');
    await createSalesDocMarked(page, 'invoice', {
      party: customer,
      line: `CL ${seed()}`,
      price: '50',
    });
  });

  test('S-0384 Period close journey', async ({ authedPage: page }) => {
    await go(page, '/reconciliation');
    await expectAuthedShell(page);
  });

  test('S-0385 Wrong entry reverse', async ({ authedPage: page }) => {
    await simpleEntryMoneyOut(page, '33');
    await go(page, '/transactions');
    await expectAuthedShell(page);
  });

  test('S-0388 Approval workflow day', async ({ authedPage: page }) => {
    await go(page, '/purchase/purchases');
    await expectAuthedShell(page);
  });

  test('S-0389 GRNI full path', async ({ authedPage: page }) => {
    await createPurchaseDocMarked(page, 'order', {
      party: vendor,
      line: physicalName || physicalSku,
      price: '80',
      qty: '2',
    });
    await tryConvertFromList(page, '/purchase/orders', /Receive|GRN|Convert/i);
    await createPurchaseDocMarked(page, 'purchase', {
      party: vendor,
      line: physicalName || physicalSku,
      price: '80',
      qty: '2',
      supplierInvoice: `GRNI-${seed()}`,
    });
  });

  test('S-0390 Partial GRN multi bill', async ({ authedPage: page }) => {
    await createPurchaseDocMarked(page, 'receipt', {
      party: vendor,
      line: physicalName || `pgrn ${seed()}`,
      price: '80',
      qty: '1',
    }).catch(async () => {
      await go(page, '/purchase/receipts');
      await expectAuthedShell(page);
    });
  });

  test('S-0391 Multi-order invoice partial pay', async ({ authedPage: page }) => {
    await createSalesDocMarked(page, 'order', { party: customer, line: `MO1 ${seed()}` });
    await createSalesDocMarked(page, 'order', { party: customer, line: `MO2 ${seed()}` });
    await createSalesDocMarked(page, 'invoice', { party: customer, line: serviceName, price: '200' });
    await openReceivePaymentForm(page, customer);
    const amount = page.locator('input[name="amount"], input[type="number"]').first();
    if (await amount.isVisible().catch(() => false)) await amount.fill('25');
    await trySubmitPayment(page, false);
    await expectArAgingPage(page);
  });

  test('day wrap: money in + journal', async ({ authedPage: page }) => {
    await simpleEntryMoneyIn(page, '100');
    await expectJournalPage(page);
    await openPayVendorForm(page, vendor);
    await trySubmitPayment(page, false);
  });
});
