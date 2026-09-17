import { defineConfig, devices } from '@playwright/test';
import { authFile } from './src/config/auth';
import { testData } from './src/config/test-data';

// Credentials live in a git-ignored .env; a real environment variable wins.
try {
  process.loadEnvFile();
} catch {
  // No .env — rely on the environment.
}

/**
 * Pauses between browser operations so a headed run can be followed by eye,
 * e.g. `SLOW_MO=300 npx playwright test --headed`.
 */
const slowMo = Number(process.env.SLOW_MO ?? 0);

export default defineConfig({
  testDir: './tests',
  timeout: slowMo ? 240_000 : 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The dashboard runs against the same shared pre-prod backend as the
  // website, so retry transient blips and classify what survives.
  retries: 2,
  // One worker, as in Carwah UI: concurrent runs overload the shared backend.
  workers: 1,
  reporter: [['html'], ['list'], ['./src/reporters/environment-classifier.ts']],
  // Adding a partner cannot be undone — partners have no delete — so that one
  // spec is left out unless it is asked for:
  // `RUN_CREATE_PARTNER=1 npx playwright test --grep @creates-partner`.
  grepInvert: process.env.RUN_CREATE_PARTNER ? undefined : /@creates-partner/,
  use: {
    baseURL: testData.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { slowMo },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },
  ],
});
