import { defineConfig, devices } from '@playwright/test';

/**
 * Target app under test (BookOne web). Credentials come from env set by the runner.
 *
 * In Docker we use Alpine system Chromium via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 * (see docker/Dockerfile.web). Locally, Playwright's bundled Chromium is used.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const systemChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';

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
    // Video needs Playwright's ffmpeg binary under PLAYWRIGHT_BROWSERS_PATH.
    // Docker uses system Chromium only (no ffmpeg install) — keep video off there.
    video: systemChrome ? 'off' : 'retain-on-failure',
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
