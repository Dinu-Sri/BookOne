import { test as base, expect } from '@playwright/test';
import { loginAsE2eUser, ensureLoggedIn } from './helpers/auth';
import { requireE2eAuth, seed } from './helpers/env';

type Fixtures = {
  /** Logged-in page (serial-friendly). */
  authedPage: import('@playwright/test').Page;
  seed: string;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use) => {
    await use(seed());
  },
  authedPage: async ({ page }, use) => {
    requireE2eAuth();
    await loginAsE2eUser(page);
    await use(page);
  },
});

export { expect, ensureLoggedIn, loginAsE2eUser, requireE2eAuth, seed };
