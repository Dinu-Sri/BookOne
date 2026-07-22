import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { go } from './nav';

/**
 * Best-effort stock on-hand read from inventory levels UI.
 * Returns null if the product row / qty cell cannot be resolved.
 */
export async function readStockOnHand(
  page: Page,
  productHint: string,
): Promise<number | null> {
  await go(page, '/inventory/levels');
  const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(productHint.slice(0, 24));
    await page.waitForTimeout(500);
  }

  const row = page.locator('table tbody tr').filter({ hasText: productHint.slice(0, 12) }).first();
  if (!(await row.isVisible().catch(() => false))) {
    // Try without search filter
    await go(page, '/inventory/levels');
    const anyRow = page.locator('table tbody tr').first();
    if (!(await anyRow.isVisible().catch(() => false))) return null;
  }

  const target = (await row.isVisible().catch(() => false))
    ? row
    : page.locator('table tbody tr').filter({ hasText: productHint.slice(0, 8) }).first();

  if (!(await target.isVisible().catch(() => false))) return null;

  const cells = target.locator('td');
  const n = await cells.count();
  // Prefer last numeric-looking cell (qty often rightmost)
  for (let i = n - 1; i >= 0; i--) {
    const text = ((await cells.nth(i).innerText()) || '').replace(/,/g, '').trim();
    const m = text.match(/-?\d+(\.\d+)?/);
    if (m) {
      const v = Number(m[0]);
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

export async function expectStockLevelsPage(page: Page) {
  await go(page, '/inventory/levels');
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function expectStockLedgerPage(page: Page) {
  await go(page, '/inventory/ledger');
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function expectArAgingPage(page: Page) {
  await go(page, '/sales/aging');
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function expectApAgingPage(page: Page) {
  await go(page, '/purchase/aging');
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function expectJournalPage(page: Page) {
  await go(page, '/journal');
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}
