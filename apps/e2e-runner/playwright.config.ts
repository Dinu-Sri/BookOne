import { defineConfig, devices } from '@playwright/test';

/**
 * Target app under test. Credentials: E2E_EMAIL / E2E_PASSWORD.
 * Docker: system Chromium via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 *
 * Suite tiers (E2E_SUITE) — default `core` for /e2e so runs finish in ~1–2h, not 6h:
 *   smoke  — 00 only (~2 min)
 *   p0     — 00–13 deep P0 packs (~45–90 min)
 *   core   — p0 + parties/platform/mid-op/routes/settings (~1.5–2.5h)  [DEFAULT]
 *   full   — everything including matrices, remainder, stress (multi-hour)
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const systemChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';
const suite = (process.env.E2E_SUITE || 'core').toLowerCase().trim();
const fullSuite = suite === 'full' || process.env.E2E_FULL === '1' || process.env.E2E_FULL === 'true';

/** File globs per tier (relative to testDir). */
const SUITE_MATCH: Record<string, string | string[]> = {
  smoke: '00-smoke.spec.ts',
  p0: [
    '00-smoke.spec.ts',
    '01-auth.spec.ts',
    '02-public.spec.ts',
    '03-shell-routes.spec.ts',
    '04-company-masters.spec.ts',
    '05-parties-products.spec.ts',
    '06-sales-journey.spec.ts',
    '07-purchase-inventory.spec.ts',
    '08-accounting.spec.ts',
    '09-pos.spec.ts',
    '10-edges-security.spec.ts',
    '11-integrity.spec.ts',
    '12-settings-save.spec.ts',
    '13-validation-catalog.spec.ts',
  ],
  core: [
    '00-smoke.spec.ts',
    '01-auth.spec.ts',
    '02-public.spec.ts',
    '03-shell-routes.spec.ts',
    '04-company-masters.spec.ts',
    '05-parties-products.spec.ts',
    '06-sales-journey.spec.ts',
    '07-purchase-inventory.spec.ts',
    '08-accounting.spec.ts',
    '09-pos.spec.ts',
    '10-edges-security.spec.ts',
    '11-integrity.spec.ts',
    '12-settings-save.spec.ts',
    '13-validation-catalog.spec.ts',
    '14-route-smoke-ids.spec.ts',
    '15-business-day.spec.ts',
    '16-parties-catalog.spec.ts',
    '17-platform.spec.ts',
    '18-settings-matrix.spec.ts',
    '19-mid-op-edges.spec.ts',
    '24-ui-ux.spec.ts',
  ],
  full: '**/*.spec.ts',
};

const testMatch = SUITE_MATCH[suite] ?? SUITE_MATCH.core;

export default defineConfig({
  testDir: './tests',
  testMatch,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry reduces flaky login/nav noise without doubling full-suite wall time too hard.
  retries: process.env.CI || process.env.E2E_RETRIES === '1' ? 1 : 0,
  workers: 1,
  timeout: suite === 'smoke' ? 90_000 : fullSuite ? 180_000 : 150_000,
  expect: { timeout: suite === 'smoke' ? 12_000 : 20_000 },
  // Cap non-full runs so a stuck suite cannot run for 6h. Full has no wall clock.
  globalTimeout: fullSuite ? 0 : suite === 'smoke' ? 15 * 60_000 : 3 * 60 * 60_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: process.env.E2E_HTML_DIR || 'reports/html' }],
    ['json', { outputFile: process.env.E2E_JSON_PATH || 'reports/results.json' }],
    ['junit', { outputFile: process.env.E2E_JUNIT_PATH || 'reports/junit.xml' }],
  ],
  use: {
    baseURL,
    // Traces only on first retry — much faster than retain-on-failure for every test.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video is expensive; off in Docker (system Chrome) and for non-full tiers.
    video: systemChrome || suite !== 'full' ? 'off' : 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ...(systemChrome
      ? {
          launchOptions: {
            executablePath: systemChrome,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
            ],
          },
        }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: process.env.E2E_ARTIFACT_DIR || 'reports/artifacts',
});
