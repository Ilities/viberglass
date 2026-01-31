import { test as base, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface E2EFixtures {
  baseURL: string;
  backendURL: string;
  authenticatedPage: Page;
}

const stateFile = join(process.cwd(), '.e2e-state.json');
let envVars: Record<string, string> = {};

try {
  const envFile = join(process.cwd(), '.env.e2e');
  const envContent = readFileSync(envFile, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      envVars[key] = values.join('=');
    }
  });
} catch (err) {
  console.warn('No .env.e2e file found, using defaults');
}

// Test credentials from environment or defaults
const TEST_EMAIL = process.env.TEST_EMAIL || 'jussi@hallila.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'nA93baSt';

export const test = base.extend<E2EFixtures>({
  baseURL: async ({}, use) => {
    await use(process.env.BASE_URL || 'http://localhost:3000');
  },
  backendURL: async ({}, use) => {
    await use(process.env.BACKEND_URL || 'http://localhost:8888');
  },
  authenticatedPage: async ({ page }, use) => {
    // Perform login
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';

// Helper functions for tests
export const TestHelpers = {
  async login(page: Page, email: string = TEST_EMAIL, password: string = TEST_PASSWORD) {
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 10000 });
  },

  async logout(page: Page) {
    // Click avatar/user menu in sidebar
    await page.locator('[data-slot="avatar"]').first().click();
    // Look for logout option (might need adjustment based on actual UI)
    const logoutButton = page.getByText('Sign out').or(page.getByText('Logout')).or(page.getByText('Log out'));
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    }
  },

  async waitForLoadingToFinish(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  },

  // Generate unique test data
  generateUniqueId() {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  },

  generateProjectName() {
    return `Test Project ${this.generateUniqueId()}`;
  },

  generateClankerName() {
    return `Test Clanker ${this.generateUniqueId()}`;
  },
};
