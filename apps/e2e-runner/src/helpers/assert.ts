import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Page did not hard-crash into Next error overlay / blank login for authed routes. */
export async function expectNoAppCrash(page: Page) {
  const body = page.locator('body');
  await expect(body).toBeVisible({ timeout: 30_000 });
  const text = (await body.innerText().catch(() => '')).slice(0, 2000);
  // Soft: Next.js default error text is bad; allow empty-state copy
  if (/Application error: a client-side exception/i.test(text)) {
    throw new Error('Client-side application error boundary');
  }
  if (/Unhandled Runtime Error/i.test(text)) {
    throw new Error('Unhandled runtime error on page');
  }
}

export async function expectAuthedShell(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('.app-shell, .sidebar, .workspace').first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoAppCrash(page);
}

export async function expectPublicOk(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expectNoAppCrash(page);
}

export async function expectOnLogin(page: Page) {
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15_000 });
}

export async function expectErrorOrStay(page: Page, opts?: { stayOn?: RegExp }) {
  const err = page.locator('.auth-error, .form-error, .error, [role="alert"], .toast-error, .field-error');
  const hasErr = await err.first().isVisible().catch(() => false);
  if (hasErr) return;
  if (opts?.stayOn) {
    await expect(page).toHaveURL(opts.stayOn);
    return;
  }
  // HTML5 validation may block submit without visible custom error
  const invalid = page.locator(':invalid');
  if ((await invalid.count()) > 0) return;
  // Still on a form page is acceptable for validation scenarios
  await expect(page.locator('form, .workspace, .auth-card').first()).toBeVisible();
}

export async function pageHasText(page: Page, re: RegExp | string) {
  await expect(page.getByText(re).first()).toBeVisible({ timeout: 20_000 });
}
