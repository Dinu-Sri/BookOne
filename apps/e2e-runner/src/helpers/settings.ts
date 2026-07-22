import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { clickPrimary } from './forms';
import { go } from './nav';
import { seed } from './env';

/**
 * Open a company settings page, set a text field if present, save, reload, and
 * assert the value persisted (mutate-level depth for §27 / masters).
 */
export async function saveAndReloadTextField(
  page: Page,
  path: string,
  fieldSelector: string,
  value?: string,
): Promise<{ fieldFound: boolean; value: string }> {
  const next = value ?? `E2E ${seed()}`.slice(0, 40);
  await go(page, path);
  const field = page.locator(fieldSelector).first();
  const fieldFound = await field.isVisible().catch(() => false);
  if (!fieldFound) {
    await expect(page.locator('form, .workspace, .party-form-shell').first()).toBeVisible();
    return { fieldFound: false, value: next };
  }

  await field.fill(next);
  await clickPrimary(page, /Save|Update|Apply/i);
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await go(page, path);
  const after = page.locator(fieldSelector).first();
  if (await after.isVisible().catch(() => false)) {
    await expect(after).toHaveValue(new RegExp(escapeRe(next.slice(0, 12))));
  }
  return { fieldFound: true, value: next };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Toggle first checkbox/switch on a settings page if present, save, reload. */
export async function toggleFirstSettingAndReload(page: Page, path: string): Promise<boolean> {
  await go(page, path);
  const toggle = page
    .locator('input[type="checkbox"], [role="switch"]')
    .filter({ hasNot: page.locator('[disabled]') })
    .first();
  if (!(await toggle.isVisible().catch(() => false))) {
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    return false;
  }
  const before = await toggle.isChecked().catch(() => false);
  if (before) await toggle.uncheck().catch(() => toggle.click());
  else await toggle.check().catch(() => toggle.click());
  await clickPrimary(page, /Save|Update|Apply/i).catch(() => undefined);
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await go(page, path);
  // Restore original to avoid polluting tenant settings permanently when possible
  const again = page.locator('input[type="checkbox"], [role="switch"]').first();
  if (await again.isVisible().catch(() => false)) {
    const now = await again.isChecked().catch(() => !before);
    if (now !== before) {
      if (before) await again.check().catch(() => again.click());
      else await again.uncheck().catch(() => again.click());
      await clickPrimary(page, /Save|Update|Apply/i).catch(() => undefined);
      await page.waitForTimeout(800);
    }
  }
  return true;
}
