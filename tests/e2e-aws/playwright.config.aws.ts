import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load AWS test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.aws-test') });

/**
 * Playwright configuration for AWS staging environment tests
 * These tests run against real AWS infrastructure (not local/mocked)
 */
export default defineConfig({
  testDir: './tests',

  // Test file patterns
  testMatch: '**/*.spec.ts',

  // Longer timeout for AWS operations
  timeout: 120000, // 2 minutes per test

  // Global setup/teardown
  globalSetup: require.resolve('./fixtures/global-setup.ts'),
  globalTeardown: require.resolve('./fixtures/global-teardown.ts'),

  // Expect timeout for assertions
  expect: {
    timeout: 15000, // 15s for assertions
  },

  // Test execution settings
  fullyParallel: false, // Sequential to avoid resource contention
  forbidOnly: !!process.env.CI, // Fail CI if test.only is committed
  retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
  workers: process.env.CI ? 1 : 1, // Run one test at a time

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ...(process.env.CI ? [['github']] : []),
  ],

  // Output settings
  use: {
    // Base URL for API requests
    baseURL: process.env.AWS_API_URL,

    // API request timeout
    actionTimeout: 30000, // 30s

    // Trace collection
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording
    video: 'retain-on-failure',

    // Extra HTTP headers
    extraHTTPHeaders: {
      'X-Tenant-Id': process.env.TEST_TENANT_ID || 'staging-e2e-test',
      'Accept': 'application/json',
    },
  },

  // Test projects (different configurations)
  projects: [
    {
      name: 'api-tests',
      testMatch: '**/!(github-webhook-integration).spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'webhook-tests',
      testMatch: '**/github-webhook-integration.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
      // Webhook tests need GitHub webhook to be configured
      grep: process.env.GITHUB_TEST_REPO ? undefined : /@skip/,
    },
  ],

  // Web server (not used for AWS tests, but required for Playwright)
  // We connect to already-running AWS infrastructure
  webServer: undefined,
});
