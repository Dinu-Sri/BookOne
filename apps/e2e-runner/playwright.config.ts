import { defineConfig, devices } from '@playwright/test';

/**
 * Target app under test. Credentials: E2E_EMAIL / E2E_PASSWORD.
 * Docker: system Chromium via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const systemChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';
const fullSuite = process.env.E2E_FULL === '1' || process.env.E2E_FULL === 'true';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: fullSuite ? 180_000 : 120_000,
  expect: { timeout: 20_000 },
  globalTimeout: fullSuite ? 0 : 45 * 60_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: process.env.E2E_HTML_DIR || 'reports/html' }],
    ['json', { outputFile: process.env.E2E_JSON_PATH || 'reports/results.json' }],
    ['junit', { outputFile: process.env.E2E_JUNIT_PATH || 'reports/junit.xml' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: systemChrome ? 'off' : 'retain-on-failure',
    actionTimeout: 25_000,
    navigationTimeout: 60_000,
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
