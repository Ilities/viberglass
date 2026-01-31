import { test, expect, TestHelpers } from '../../playwright/fixtures';

test.describe('Authentication E2E Tests', () => {
  const helpers = TestHelpers;

  test.beforeEach(async ({ page }) => {
    // Start fresh for each test
    await page.context().clearCookies();
    await page.context().clearPermissions();
  });

  test.describe('Login Page', () => {
    test('should display login form with required fields', async ({ page }) => {
      await page.goto('/login');

      // Check page title
      await expect(page).toHaveTitle(/Viberglass/);

      // Check for login heading
      await expect(page.getByText('Sign in to your account')).toBeVisible();

      // Check for email input
      const emailInput = page.locator('input[name="email"]');
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(emailInput).toHaveAttribute('required');

      // Check for password input
      const passwordInput = page.locator('input[name="password"]');
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveAttribute('required');

      // Check for login button
      const loginButton = page.locator('button[type="submit"]');
      await expect(loginButton).toBeVisible();
      await expect(loginButton).toContainText('Login');

      // Check for "Remember me" checkbox
      await expect(page.locator('input[name="remember"]')).toBeVisible();

      // Check for "Forgot password?" link
      await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();

      // Check for "Sign up" link
      await expect(page.getByText('Don\'t have an account?')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
    });

    test('should show validation error for empty credentials', async ({ page }) => {
      await page.goto('/login');

      // Try to submit without filling fields
      await page.click('button[type="submit"]');

      // Browser should validate required fields
      const emailInput = page.locator('input[name="email"]');
      await expect(emailInput).toHaveAttribute('required');

      const passwordInput = page.locator('input[name="password"]');
      await expect(passwordInput).toHaveAttribute('required');
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('input[name="email"]', 'invalid@test.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.getByText(/Unable to sign in|Invalid|Error/)).toBeVisible({ timeout: 5000 });
    });

    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('input[name="email"]', 'jussi@hallila.com');
      await page.fill('input[name="password"]', 'nA93baSt');
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await page.waitForURL('/', { timeout: 10000 });

      // Should show dashboard
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    test('should redirect to dashboard if already authenticated', async ({ authenticatedPage: page }) => {
      await page.goto('/login');

      // Should redirect to dashboard if already logged in
      await page.waitForURL('/', { timeout: 5000 });
      await expect(page.getByText('Dashboard')).toBeVisible();
    });
  });

  test.describe('Forgot Password', () => {
    test('should display forgot password page', async ({ page }) => {
      await page.goto('/forgot-password');

      await expect(page.getByText(/Forgot Password|Reset Password/)).toBeVisible();
    });
  });

  test.describe('Registration', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByText(/Sign up|Create account/)).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should persist session across page navigations', async ({ page }) => {
      await helpers.login(page);

      // Navigate to different pages
      await page.goto('/');
      await expect(page.getByText('Dashboard')).toBeVisible();

      await page.goto('/settings/integrations');
      await expect(page.getByText('Integrations')).toBeVisible();

      // Session should still be valid
      await page.goto('/');
      await expect(page.getByText('Dashboard')).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      const protectedRoutes = [
        '/settings/integrations',
        '/secrets',
        '/clankers',
      ];

      for (const route of protectedRoutes) {
        await page.context().clearCookies();
        await page.goto(route);

        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 5000 });
        await expect(page.getByText('Sign in to your account')).toBeVisible();
      }
    });

    test('should allow authenticated users to access protected routes', async ({ authenticatedPage: page }) => {
      const protectedRoutes = [
        { path: '/settings/integrations', title: 'Integrations' },
        { path: '/secrets', title: 'Secrets' },
        { path: '/clankers', title: 'Clankers' },
      ];

      for (const route of protectedRoutes) {
        await page.goto(route.path);
        await expect(page.getByText(route.title)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('SEC-1 to SEC-6: Authentication Security', () => {
    test('SEC-1: should isolate user sessions', async ({ context }) => {
      // Create two separate browser contexts
      const context1 = context.browser()?.newContext();
      const context2 = context.browser()?.newContext();

      if (!context1 || !context2) {
        test.skip();
        return;
      }

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login in first context
      await page1.goto('/login');
      await page1.fill('input[name="email"]', 'jussi@hallila.com');
      await page1.fill('input[name="password"]', 'nA93baSt');
      await page1.click('button[type="submit"]');
      await page1.waitForURL('/');

      // Second context should not be authenticated
      await page2.goto('/');
      // Should redirect to login if not authenticated
      await page2.waitForURL(/\/(login|\?)/, { timeout: 5000 });

      await context1.close();
      await context2.close();
    });
  });
});
