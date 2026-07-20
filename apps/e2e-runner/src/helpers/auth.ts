import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { requireE2eAuth } from './env';

/** Login via UI and wait for app shell. */
export async function loginAsE2eUser(page: Page) {
  const { email, password } = requireE2eAuth();
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
  await expect(page.locator('.app-shell, .sidebar').first()).toBeVisible({ timeout: 30_000 });
}

/** Ensure logged in; re-login if session missing. */
export async function ensureLoggedIn(page: Page) {
  await page.goto('/');
  if (page.url().includes('/login')) {
    await loginAsE2eUser(page);
  } else {
    await expect(page.locator('.app-shell, .sidebar, .workspace').first()).toBeVisible({
      timeout: 20_000,
    });
  }
}
