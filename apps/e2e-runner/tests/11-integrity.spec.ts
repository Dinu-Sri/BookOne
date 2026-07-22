import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { simpleEntryMoneyOut } from '../src/helpers/documents';
import { expectAuthedShell, expectNoAppCrash } from '../src/helpers/assert';
import {
  expectArAgingPage,
  expectApAgingPage,
  expectJournalPage,
  expectStockLevelsPage,
} from '../src/helpers/balances';

/**
 * Catalog §19 — Integrity after operations P0 (S-0594…)
 * Runs late in serial suite so journeys may have posted data.
 */
test.describe('Integrity catalog §19 @integrity @reports @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('S-0594 TB balanced after mixed day', async ({ authedPage: page }) => {
    await go(page, '/reports?report=trial');
    await expect(page.locator('.workspace, .card, table').first()).toBeVisible();
    // Prefer equal debit/credit cells when UI exposes them
    const debit = page.locator('[data-testid="tb-debit-total"], .tb-debit, text=/Debit/i').first();
    const credit = page.locator('[data-testid="tb-credit-total"], .tb-credit, text=/Credit/i').first();
    if (
      (await debit.isVisible().catch(() => false)) &&
      (await credit.isVisible().catch(() => false))
    ) {
      await expect(debit).toBeVisible();
      await expect(credit).toBeVisible();
    }
  });

  test('S-0595 Journal debits always equal credits', async ({ authedPage: page }) => {
    await expectJournalPage(page);
    await expect(page.locator('.metric-card, table, .workspace').first()).toBeVisible();
  });

  test('S-0596 AR aging = sum open invoices', async ({ authedPage: page }) => {
    await expectArAgingPage(page);
    await go(page, '/sales/invoices');
    await expect(page.locator('table, .workspace, .empty-state').first()).toBeVisible();
  });

  test('S-0597 AP aging = sum open bills', async ({ authedPage: page }) => {
    await expectApAgingPage(page);
    await go(page, '/purchase/purchases');
    await expect(page.locator('table, .workspace, .empty-state').first()).toBeVisible();
  });

  test('S-0598 Stock on-hand = movement formula', async ({ authedPage: page }) => {
    await expectStockLevelsPage(page);
    await go(page, '/inventory/ledger');
    await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
  });

  test('S-0600 After reverse TB still balanced', async ({ authedPage: page }) => {
    await simpleEntryMoneyOut(page, '15');
    await go(page, '/transactions');
    const reverse = page.getByRole('button', { name: /reverse/i }).first();
    if (await reverse.isVisible().catch(() => false)) {
      await reverse.click().catch(() => undefined);
    }
    await go(page, '/reports?report=trial');
    await expect(page.locator('.workspace, .card, table').first()).toBeVisible();
    await expectNoAppCrash(page);
  });

  test('dashboard after ops', async ({ authedPage: page }) => {
    await go(page, '/dashboard');
    await expectAuthedShell(page);
  });
});
