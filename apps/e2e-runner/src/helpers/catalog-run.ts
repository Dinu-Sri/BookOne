import type { Browser, Page } from '@playwright/test';
import type { Scenario } from '../runner/types';
import { executeScenario, newRunCtx } from '../runner/execute';
import { expectNoAppCrash } from './assert';

/** Run one catalog scenario via the shared executor with shell safety. */
export async function runCatalogScenario(page: Page, browser: Browser, s: Scenario) {
  const ctx = newRunCtx();
  await executeScenario(page, s, ctx, browser);
  await expectNoAppCrash(page);
}
