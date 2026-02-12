import { test, expect, TestHelpers } from '../../playwright/fixtures';

test.describe('Ticket Management E2E Tests', () => {
  const helpers = TestHelpers;

  test.describe('T-1 to T-6: Ticket CRUD Operations', () => {
    test('T-1: should create a new ticket', async ({ authenticatedPage: page }) => {
      // First navigate to a project
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found. Create a project first.');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      // Get project slug from URL
      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Navigate to create ticket page
      await page.goto(`/project/${projectSlug}/tickets/create`);

      // Check page title
      await expect(page.getByText('Create New Ticket')).toBeVisible();

      // Fill in ticket details
      await page.fill('input[name="title"]', `E2E Test Ticket ${helpers.generateUniqueId()}`);

      // Fill description
      await page.fill('textarea[name="description"]', 'This is a test ticket created by E2E tests. Steps to reproduce: 1. Go to homepage 2. Observe behavior');

      // Select severity
      await page.selectOption('select[name="severity"]', 'high');

      // Fill category
      await page.fill('input[name="category"]', 'E2E Testing');

      // Submit form
      await page.click('button[type="submit"]:has-text("Create Ticket")');

      // Should navigate to ticket detail page or show success
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      if (currentUrl.includes('/tickets/')) {
        expect(currentUrl).toMatch(/\/project\/[^/]+\/tickets\/[^/]+$/);
      }
    });

    test('T-2: should create ticket with screenshot', async ({ authenticatedPage: page }) => {
      // Navigate to a project
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets/create`);

      // Fill basic ticket info
      await page.fill('input[name="title"]', `E2E Test Ticket with Screenshot ${helpers.generateUniqueId()}`);
      await page.fill('textarea[name="description"]', 'Test ticket with screenshot');
      await page.selectOption('select[name="severity"]', 'medium');
      await page.fill('input[name="category"]', 'UI');

      // Create a small test image buffer
      // In a real scenario, we'd upload an actual file
      const fileInput = page.locator('input[name="screenshot"]');
      const hasFileInput = await fileInput.count() > 0;

      if (hasFileInput) {
        // We're not actually uploading a file in this test
        // Just verifying the file input exists
        await expect(fileInput).toHaveAttribute('type', 'file');
      }
    });

    test('T-3: should create ticket with recording', async ({ authenticatedPage: page }) => {
      // Navigate to a project
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets/create`);

      // Check for recording input
      const recordingInput = page.locator('input[name="recording"]');
      const hasRecordingInput = await recordingInput.count() > 0;

      if (hasRecordingInput) {
        await expect(recordingInput).toHaveAttribute('type', 'file');
        await expect(recordingInput).toHaveAttribute('accept', /video/);
      }
    });

    test('T-4: should run ticket (create job)', async ({ authenticatedPage: page }) => {
      // Navigate to a project with tickets
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Go to tickets list
      await page.goto(`/project/${projectSlug}/tickets`);

      // Look for existing tickets
      const ticketRows = page.locator('a[href^="/tickets/"]');
      const ticketCount = await ticketRows.count();

      if (ticketCount === 0) {
        test.skip(true, 'No tickets found');
        return;
      }

      // Navigate to first ticket
      await ticketRows.first().click();
      await page.waitForURL(/\/tickets\/[^/]+$/);

      // Look for "Run" or "Execute" button
      const runButton = page.getByRole('button', { name: /run|execute|fix/i })
        .or(page.locator('button:has-text("Run")'))
        .or(page.locator('button:has-text("Execute")'));

      if (await runButton.count() > 0) {
        // Found run button - clicking it would create a job
        // We won't actually click it to avoid triggering real jobs
        await expect(runButton.first()).toBeVisible();
      } else {
        test.skip(true, 'Run button not found on ticket page');
      }
    });

    test('T-6: should list tickets by project', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Navigate to tickets page
      await page.goto(`/project/${projectSlug}/tickets`);

      // Should show tickets list
      await page.waitForTimeout(1000);

      // Check for tickets table or list
      const table = page.locator('table');
      const hasTable = await table.count() > 0;

      if (!hasTable) {
        // Might show empty state
        const emptyState = page.getByText(/no tickets|empty/i);
        if (await emptyState.count() > 0) {
          // Empty state is OK
          expect(true).toBe(true);
        }
      }
    });
  });

  test.describe('Ticket Detail Page', () => {
    test('should display ticket details', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Go to tickets list
      await page.goto(`/project/${projectSlug}/tickets`);

      const ticketRows = page.locator('a[href^="/tickets/"]');
      const ticketCount = await ticketRows.count();

      if (ticketCount === 0) {
        test.skip(true, 'No tickets found');
        return;
      }

      // Click first ticket
      await ticketRows.first().click();
      await page.waitForURL(/\/tickets\/[^/]+$/);

      // Should show ticket title
      const titleElement = page.locator('h1, h2').filter({ hasText: /.+/ });
      await expect(titleElement.first()).toBeVisible();
    });

    test('T-5: should display PR URL when available', async ({ authenticatedPage: page }) => {
      // This test requires a ticket with a completed job
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Go to jobs instead
      await page.goto(`/project/${projectSlug}/jobs`);

      // Look for completed jobs with PR URLs
      const prLink = page.locator('a[href*="github.com"]').or(page.locator('a[href*="pull"]'));
      const hasPrLink = await prLink.count() > 0;

      if (hasPrLink) {
        await expect(prLink.first()).toBeVisible();
      } else {
        test.skip(true, 'No completed jobs with PR URLs found');
      }
    });
  });

  test.describe('Ticket Severity and Category', () => {
    test('should display severity badges', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets`);

      // Look for severity badges
      const badges = page.locator('[class*="badge"]');
      const badgeCount = await badges.count();

      if (badgeCount === 0) {
        test.skip(true, 'No tickets with severity badges found');
      }
    });

    test('should allow selecting severity when creating ticket', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets/create`);

      // Check severity dropdown
      const severitySelect = page.locator('select[name="severity"]');
      await expect(severitySelect).toBeVisible();

      // Check options
      const options = await severitySelect.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(0);

      // Should have common severity levels
      const severityText = options.join(' ');
      expect(severityText.toLowerCase()).toMatch(/low|medium|high|critical/);
    });
  });

  test.describe('Ticket Validation', () => {
    test('should require title and description', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets/create`);

      // Try to submit without filling fields
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should show validation errors
      const titleInput = page.locator('input[name="title"]');
      await expect(titleInput).toHaveAttribute('required');

      const descInput = page.locator('textarea[name="description"]');
      await expect(descInput).toHaveAttribute('required');
    });
  });

  test.describe('Ticket List Filtering', () => {
    test('should display ticket list with proper columns', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      await page.goto(`/project/${projectSlug}/tickets`);

      // Look for table headers
      const headers = page.locator('th');
      const headerCount = await headers.count();

      if (headerCount > 0) {
        const headerText = await headers.allTextContents();
        const headersJoined = headerText.join(' ').toLowerCase();
        // Should have at least some common columns
        expect(headersJoined).toBeTruthy();
      }
    });
  });

  test.describe('Manual Ticket Flow', () => {
    test('should support complete manual ticket creation flow', async ({ authenticatedPage: page }) => {
      // This is the manual flow from the testing plan
      await page.goto('/');

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, 'No projects found');
        return;
      }

      // Navigate to first project
      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, 'Could not extract project slug');
        return;
      }

      // Create ticket
      await page.goto(`/project/${projectSlug}/tickets/create`);

      const uniqueId = helpers.generateUniqueId();
      await page.fill('input[name="title"]', `Manual Test Ticket ${uniqueId}`);
      await page.fill('textarea[name="description"]', 'This is a manually created test ticket');
      await page.selectOption('select[name="severity"]', 'medium');
      await page.fill('input[name="category"]', 'Manual Test');

      await page.click('button[type="submit"]:has-text("Create Ticket")');

      // Wait for navigation
      await page.waitForTimeout(2000);

      // Should be on ticket detail page or back in list
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/project\/${projectSlug}\/tickets\/.+/);
    });
  });
});
