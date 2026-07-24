import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { requireE2eAuth } from './env';

async function waitForAppShell(page: Page) {
  await expect(page.locator('.app-shell, .sidebar').first()).toBeVisible({ timeout: 30_000 });
}

type LoginOpts = {
  /** Force clear cookies and re-login (auth suite). Default: reuse session if still valid. */
  fresh?: boolean;
};

/** Login via UI and wait for app shell. */
export async function loginAsE2eUser(page: Page, opts: LoginOpts = {}) {
  const { email, password } = requireE2eAuth();

  if (!opts.fresh) {
    // Reuse existing session — full suite was clearing cookies every test and
    // hammering login (rate limits / intermittent "Invalid email or password").
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/login')) {
      await waitForAppShell(page);
      return;
    }
  } else {
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/login')) {
      await waitForAppShell(page);
      return;
    }
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/login')) {
    await waitForAppShell(page);
    return;
  }

  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

  const attemptLogin = async () => {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await Promise.race([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
      page
        .locator('.auth-error')
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(async () => {
          const msg = (await page.locator('.auth-error').textContent())?.trim() || 'Login failed';
          throw new Error(msg);
        }),
    ]);
  };

  try {
    await attemptLogin();
  } catch (first) {
    await page.waitForTimeout(2000);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/login')) {
      await waitForAppShell(page);
      return;
    }
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });
    try {
      await attemptLogin();
    } catch {
      throw first;
    }
  }

  await waitForAppShell(page);
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

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token.sig',
  '__Secure-better-auth.session_token.sig',
];

async function clearSessionCookies(page: Page) {
  await page.context().clearCookies();
  const cookies = await page.context().cookies();
  const leftover = cookies.filter((c) =>
    SESSION_COOKIE_NAMES.some((n) => c.name === n || c.name.includes('session_token')),
  );
  if (leftover.length) {
    await page.context().addCookies(
      leftover.map((c) => ({
        ...c,
        value: '',
        expires: 0,
      })),
    );
  }
}

/** Sign out via topbar control and assert session cleared. */
export async function signOutE2eUser(page: Page) {
  const logout = page.getByRole('button', { name: /log ?out|sign ?out/i }).first();
  if (await logout.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 30_000 }).catch(() => undefined),
      logout.click(),
    ]);
  }
  await clearSessionCookies(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}
