import { defineConfig, devices } from '@playwright/test';

/**
 * Target app under test (BookOne web). Credentials come from env set by the runner.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
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
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: process.env.E2E_ARTIFACT_DIR || 'reports/artifacts',
});
