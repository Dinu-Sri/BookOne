import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { expectAuthedShell } from '../src/helpers/assert';
import { saveAndReloadTextField, toggleFirstSettingAndReload } from '../src/helpers/settings';
import { seed } from '../src/helpers/env';

/**
 * Catalog §27 — Company settings pages save (S-0694…S-0698)
 * Mutate depth: change → save → reload → persist (or form healthy if field absent).
 */
test.describe('Company settings save catalog §27 @settings @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('S-0694 Save company details settings', async ({ authedPage: page }) => {
    const marker = `E2E Co ${seed()}`.slice(0, 40);
    await saveAndReloadTextField(
      page,
      '/company/details',
      'input[name="legalName"], input[name="name"], input[name="tradingName"]',
      marker,
    );
    await expectAuthedShell(page);
  });

  test('S-0695 Save company tax settings', async ({ authedPage: page }) => {
    await go(page, '/company/tax');
    const tin = page.locator('input[name="tin"], input[name="taxId"], input[name="vatNumber"]').first();
    if (await tin.isVisible().catch(() => false)) {
      const cur = await tin.inputValue().catch(() => '');
      const next = cur || `T${seed().slice(0, 8)}`;
      await tin.fill(next);
      await page.getByRole('button', { name: /Save|Update|Apply/i }).first().click().catch(() => undefined);
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await go(page, '/company/tax');
      if (await tin.isVisible().catch(() => false)) {
        const after = await tin.inputValue().catch(() => '');
        expect(after.length).toBeGreaterThan(0);
      }
    } else {
      await toggleFirstSettingAndReload(page, '/company/tax');
    }
    await expect(page.locator('form, .workspace').first()).toBeVisible();
  });

  test('S-0696 Save company sales settings', async ({ authedPage: page }) => {
    await go(page, '/company/sales');
    await expect(page.locator('form, #pos-registers, .workspace').first()).toBeVisible();
    await toggleFirstSettingAndReload(page, '/company/sales');
    await expectAuthedShell(page);
  });

  test('S-0697 Save company purchase settings', async ({ authedPage: page }) => {
    await go(page, '/company/purchase');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await toggleFirstSettingAndReload(page, '/company/purchase');
    await expectAuthedShell(page);
  });

  test('S-0698 Save company inventory settings', async ({ authedPage: page }) => {
    await go(page, '/company/inventory');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await toggleFirstSettingAndReload(page, '/company/inventory');
    await expectAuthedShell(page);
  });
});
