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
  // Prefer document/company form footers so we never hit line-level "Save as product".
  const footerSubmit = page
    .locator('.doc-form-footer button[type="submit"], .company-form-footer button[type="submit"]')
    .filter({ hasText: name })
    .first();
  const namedSubmit = page
    .locator('button.button.primary[type="submit"], button[type="submit"].button.primary')
    .filter({ hasText: name })
    .first();
  const byRole = page.getByRole('button', { name }).first();

  const btn = (await footerSubmit.isVisible().catch(() => false))
    ? footerSubmit
    : (await namedSubmit.isVisible().catch(() => false))
      ? namedSubmit
      : byRole;

  await expect(btn).toBeVisible({ timeout: 15_000 });
  // Commercial docs keep Save disabled until at least one line exists.
  await expect(btn).toBeEnabled({ timeout: 25_000 });
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
  // ProductAddSearch placeholder is "Type SKU, name, or free-text…" — not "Search".
  const search = page
    .locator(
      [
        'input.product-add-search-input',
        'input[placeholder*="SKU"]',
        'input[placeholder*="free-text"]',
        'input[placeholder*="free text"]',
        'input[placeholder*="Search"]',
        'input[placeholder*="search"]',
        'input[placeholder*="catalog"]',
        'input[placeholder*="product"]',
      ].join(', '),
    )
    .first();

  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.click();
  await search.fill(description);
  await search.press('Enter');

  // Wait until a real line row appears (empty-state row has no description input).
  const lineDesc = page.locator(
    'input[name^="line_"][name$="_description"], .doc-lines-table tbody tr.doc-line-manual input, .doc-lines-table tbody tr input[name*="description"]',
  );
  await expect(lineDesc.last()).toBeVisible({ timeout: 15_000 });

  // Prefer named fields on the last line.
  const priceInput = page.locator('input[name^="line_"][name$="_unitPrice"]').last();
  const qtyInput = page.locator('input[name^="line_"][name$="_quantity"]').last();
  if (await qtyInput.isVisible().catch(() => false)) {
    await qtyInput.fill(qty);
  }
  if (await priceInput.isVisible().catch(() => false)) {
    await priceInput.fill(unitPrice);
  } else {
    // Fallback: last visible non-hidden inputs in the last data row
    const rows = page.locator('.doc-lines-table tbody tr').filter({
      has: page.locator('input[name*="description"], input:not([type=hidden])'),
    });
    const last = rows.last();
    const inputs = last.locator('input:not([type=hidden]):not([type=checkbox])');
    const n = await inputs.count();
    if (n >= 2) {
      await inputs.nth(n - 2).fill(qty).catch(() => undefined);
      await inputs.nth(n - 1).fill(unitPrice).catch(() => undefined);
    } else if (n === 1) {
      await inputs.first().fill(unitPrice).catch(() => undefined);
    }
  }

  // QtyStepper may keep quantity in a controlled input — blur to commit.
  await page.locator('body').click({ position: { x: 0, y: 0 } }).catch(() => undefined);
}

export async function waitForNotLogin(page: Page) {
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 });
}

export function tableHasText(page: Page, text: string | RegExp): Locator {
  return page.locator('table, .table-wrap').getByText(text);
}
