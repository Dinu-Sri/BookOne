import { defineConfig, devices } from '@playwright/test';
import { resolveSuiteToFiles } from './src/buckets';

/**
 * Target: E2E_BASE_URL + E2E_EMAIL / E2E_PASSWORD.
 * E2E_SUITE = bucket id (auth, sales, …) or preset (smoke | p0 | core | full).
 * Default: core.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const systemChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';
const suite = (process.env.E2E_SUITE || 'core').toLowerCase().trim();
const resolved = resolveSuiteToFiles(suite);
const fullSuite = suite === 'full' || process.env.E2E_FULL === '1' || process.env.E2E_FULL === 'true';
const isSmoke = suite === 'smoke';
const isSingleBucket = resolved.kind === 'bucket';

export default defineConfig({
  testDir: './tests',
  testMatch: resolved.files.length === 1 ? resolved.files[0] : resolved.files,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI || process.env.E2E_RETRIES === '1' ? 1 : 0,
  workers: 1,
  timeout: isSmoke ? 90_000 : isSingleBucket ? 180_000 : fullSuite ? 180_000 : 150_000,
  expect: { timeout: isSmoke ? 12_000 : 20_000 },
  // Full: no wall clock. Single bucket: 90m. Presets: 3h.
  globalTimeout: fullSuite ? 0 : isSmoke ? 15 * 60_000 : isSingleBucket ? 90 * 60_000 : 3 * 60 * 60_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: process.env.E2E_HTML_DIR || 'reports/html' }],
    ['json', { outputFile: process.env.E2E_JSON_PATH || 'reports/results.json' }],
    ['junit', { outputFile: process.env.E2E_JUNIT_PATH || 'reports/junit.xml' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: systemChrome || !fullSuite ? 'off' : 'retain-on-failure',
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
