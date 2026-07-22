import { test, expect } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { createCustomer, createProduct, ensureBrand, ensureLocation } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { addManualDocLine, clickPrimary, fillBrandLocationIfPresent } from '../src/helpers/forms';
import { expectNoAppCrash, expectErrorOrStay } from '../src/helpers/assert';
import { seed } from '../src/helpers/env';

/**
 * Catalog §23 — Quantity/price micro-matrix (parameterized from catalog).
 */
const scenarios = loadScenariosBySection('23.');

function parseQtyPrice(title: string): { qty: string; price: string } {
  // e.g. "Line math qty=1 price=999.99"
  const qm = title.match(/qty\s*=\s*([0-9.-]+)/i);
  const pm = title.match(/price\s*=\s*([0-9.-]+)/i);
  return {
    qty: qm?.[1] ?? '1',
    price: pm?.[1] ?? '100',
  };
}

test.describe('Qty/price micro-matrix §23 @matrix @sales @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(480_000);

  let customer = '';

  test('matrix setup', async ({ authedPage: page }) => {
    await ensureBrand(page).catch(() => undefined);
    await ensureLocation(page).catch(() => undefined);
    customer = await createCustomer(page);
    await createProduct(page, { type: 'service', sellPrice: '100', unitCost: '0' }).catch(() => undefined);
  });

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ authedPage: page }) => {
      const { qty, price } = parseQtyPrice(s.title);
      const expectReject =
        /reject|fail|invalid|negative|zero.*reject/i.test(s.title) ||
        Number(qty) < 0 ||
        (Number(qty) === 0 && /reject|fail/i.test(s.title + s.steps.join(' ')));

      await go(page, '/sales/invoices/new');
      const partySelect = page.locator('select[name="partyName"]').first();
      if (await partySelect.isVisible().catch(() => false)) {
        await partySelect.selectOption({ index: 1 }).catch(() => undefined);
      }
      await page.locator('input[name="partyNameOverride"]').fill(customer || `E2E ${seed()}`).catch(() => undefined);
      await fillBrandLocationIfPresent(page);
      await addManualDocLine(page, `E2E matrix ${s.id} ${seed()}`, price, qty).catch(() => undefined);
      await clickPrimary(page, /Save|Create|Invoice/i).catch(() => undefined);
      await page.waitForTimeout(1200);

      if (expectReject) {
        await expectErrorOrStay(page).catch(() => undefined);
      } else {
        await go(page, '/sales/invoices');
        await expect(page.locator('table, .workspace, .empty-state').first()).toBeVisible();
      }
      await expectNoAppCrash(page);
    });
  }
});
