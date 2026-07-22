import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { hasAdminCredentials } from '../src/helpers/staging';
import { expectNoAppCrash } from '../src/helpers/assert';
import { executeScenario, newRunCtx } from '../src/runner/execute';
import { loginAsE2eUser } from '../src/helpers/auth';

/**
 * Catalog §14 Control Room + §22 Health-check.
 * Runs on any instance. Uses E2E_ADMIN_* when set; otherwise normal E2E user.
 */
const controlRoom = loadScenariosBySection('14.');
const health = loadScenariosBySection('22.');

async function loginForPlatform(page: import('@playwright/test').Page) {
  if (hasAdminCredentials()) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByTestId('login-email').fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByTestId('login-password').fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByTestId('login-submit').click();
    await page.waitForTimeout(2000);
    return;
  }
  await loginAsE2eUser(page);
}

test.describe('Control Room catalog §14 @platform @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test('S-0429 Non-admin control room redirect', async ({ authedPage: page }) => {
    await page.goto('/control-room');
    await expectNoAppCrash(page);
  });

  for (const s of controlRoom.filter((x) => x.id !== 'S-0429')) {
    test(`${s.id} ${s.title}`, async ({ page, browser }) => {
      await loginForPlatform(page);
      await executeScenario(page, s, newRunCtx(), browser);
      await expectNoAppCrash(page);
    });
  }
});

test.describe('Health-check catalog §22 @platform @health @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(600_000);

  for (const s of health) {
    test(`${s.id} ${s.title}`, async ({ page, browser }) => {
      await loginForPlatform(page);
      await executeScenario(page, s, newRunCtx(), browser);
      await page.goto('/control-room/health-check');
      await expectNoAppCrash(page);
    });
  }
});
