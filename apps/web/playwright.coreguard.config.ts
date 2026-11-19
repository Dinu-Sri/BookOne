import { defineConfig } from '@playwright/test';

const baseURL = process.env.AUTH_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  testMatch: /coreguard-custom-bank\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec next start -H 127.0.0.1 -p 3000',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? 'test-secret-for-ci-only',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
