import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Fill input/select by associated label text (BookOne `.field label` pattern). */
export async function fillByLabel(page: Page, label: string | RegExp, value: string) {
  const field = page.locator('.field').filter({ has: page.getByText(label, { exact: false }) }).first();
  const input = field.locator('input, select, textarea').first();
  await expect(input).toBeVisible({ timeout: 15_000 });
  const tag = await input.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await input.selectOption({ label: value }).catch(async () => {
      await input.selectOption({ value });
    });
  } else {
    await input.fill(value);
  }
}

export async function selectByLabel(page: Page, label: string | RegExp, option: string) {
  const field = page.locator('.field').filter({ has: page.getByText(label, { exact: false }) }).first();
  const select = field.locator('select').first();
  await select.selectOption({ label: option }).catch(async () => {
    await select.selectOption({ value: option });
  });
}

/** Click primary submit in form footer or first matching button. */
export async function clickPrimary(page: Page, name: string | RegExp) {
  const btn = page.getByRole('button', { name }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
}

export async function expectWorkspace(page: Page) {
  await expect(page.locator('.workspace, .party-workspace, .app-shell').first()).toBeVisible({
    timeout: 25_000,
  });
  await expect(page).not.toHaveURL(/\/login/);
}

/** Prefer first option after blank in brand/location if required. */
export async function fillBrandLocationIfPresent(page: Page) {
  for (const label of [/Brand/i, /Location/i]) {
    const field = page.locator('.field').filter({ has: page.getByText(label) }).first();
    if (!(await field.isVisible().catch(() => false))) continue;
    const select = field.locator('select').first();
    if (!(await select.isVisible().catch(() => false))) continue;
    const options = select.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute('value');
      if (val) {
        await select.selectOption({ index: i });
        break;
      }
    }
  }
}

/** Add a free-text document line via product search (Enter). */
export async function addManualDocLine(
  page: Page,
  description: string,
  unitPrice: string,
  qty = '1',
) {
  const search = page
    .locator('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="catalog"]')
    .first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(description);
    await search.press('Enter');
  } else {
    // Fallback: any textbox in lines area
    const tb = page.locator('.doc-lines input, .document-lines input').first();
    if (await tb.isVisible().catch(() => false)) {
      await tb.fill(description);
      await tb.press('Enter');
    }
  }
  // Fill last row price/qty if visible
  const rows = page.locator('table tbody tr, .doc-line-row, [class*="line"]');
  const rowCount = await rows.count();
  if (rowCount > 0) {
    const last = rows.nth(rowCount - 1);
    const price = last.locator('input').filter({ hasNot: page.locator('[type=hidden]') });
    const inputs = last.locator('input:not([type=hidden])');
    const n = await inputs.count();
    if (n >= 2) {
      await inputs.nth(n - 2).fill(qty).catch(() => undefined);
      await inputs.nth(n - 1).fill(unitPrice).catch(() => undefined);
    } else if (n === 1) {
      await inputs.first().fill(unitPrice).catch(() => undefined);
    }
  }
}

export async function waitForNotLogin(page: Page) {
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 });
}

export function tableHasText(page: Page, text: string | RegExp): Locator {
  return page.locator('table, .table-wrap').getByText(text);
}
