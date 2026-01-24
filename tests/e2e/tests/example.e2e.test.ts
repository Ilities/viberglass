import { test, expect } from '../playwright/fixtures';

test.describe('Example E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should load the homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/Viberator/);
  });

  test('should navigate to a page', async ({ page }) => {
    // Example navigation test
    await page.click('text=Some Link');
    await expect(page).toHaveURL(/\/some-page/);
  });

  test('should interact with a form', async ({ page }) => {
    await page.click('text=Login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('API E2E Tests', () => {
  test('should call backend API', async ({ request, backendURL }) => {
    const response = await request.get(`${backendURL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});
