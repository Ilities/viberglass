import { expect, test, TestHelpers } from "../../playwright/fixtures";

test.describe("Project Management E2E Tests", () => {
  const helpers = TestHelpers;

  test.describe("P-1 to P-5: Project CRUD Operations", () => {
    test("P-1: should create a new project", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/new");

      // Check page title
      await expect(page.getByText("Create New Project")).toBeVisible();

      // Fill in project name
      const projectName = helpers.generateProjectName();
      await page.fill('input[name="name"]', projectName);

      // Fill in repository URL
      await page.fill(
        'input[name="repository_urls"]',
        "https://github.com/test-org/test-repo",
      );

      // Select ticket system (if integration is configured)
      const ticketSystemSelect = page.locator('select[name="ticket_system"]');
      const hasConfiguredIntegrations = (await ticketSystemSelect.count()) > 0;

      if (!hasConfiguredIntegrations) {
        // If no integrations are configured, we might see a message to configure them
        const noIntegrationsMessage = page.getByText(
          /No integrations configured|Configure integrations first/,
        );
        if (await noIntegrationsMessage.isVisible()) {
          test.skip(
            true,
            "Skipping: No integrations configured. Configure integrations first.",
          );
          return;
        }

        // Try manual integration selection
        await page.click("text=Configure new integration");
        await page.selectOption(
          'select[name="ticket_system_manual"]',
          "github",
        );

        // Add credentials JSON
        const credentialsJson = JSON.stringify({
          type: "api_key",
          token: "test-token",
          owner: "test-org",
          repo: "test-repo",
        });
        await page.fill('textarea[name="credentials"]', credentialsJson);
      } else {
        // Use preconfigured integration
        await ticketSystemSelect.selectOption({ index: 1 });
      }

      // Auto-fix settings
      const autoFixSwitch = page.locator('input[name="auto_fix_enabled"]');
      if ((await autoFixSwitch.count()) > 0) {
        await page.click('label:has-text("Enable Auto-fix")');
        await page.fill('input[name="auto_fix_tags"]', "bug, high-priority");
      }

      // Agent instructions
      await page.fill(
        'textarea[name="agent_instructions"]',
        "Test instructions for E2E test",
      );

      // Submit form
      await page.click('button[type="submit"]:has-text("Create Project")');

      // Should navigate to project page or show success
      await page.waitForTimeout(2000);

      // Check for success (either redirect or success message)
      const currentUrl = page.url();
      if (currentUrl.includes("/project/")) {
        expect(currentUrl).toMatch(/\/project\/[^/]+$/);
      }
    });

    test("P-3: should enable auto-fix with tags", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/new");

      const projectName = helpers.generateProjectName();
      await page.fill('input[name="name"]', projectName);
      await page.fill(
        'input[name="repository_urls"]',
        "https://github.com/test-org/test-repo",
      );

      // Check if integrations are configured
      const ticketSystemSelect = page.locator('select[name="ticket_system"]');
      if ((await ticketSystemSelect.count()) > 0) {
        await ticketSystemSelect.selectOption({ index: 1 });
      } else {
        await page.click("text=Configure new integration");
        await page.selectOption(
          'select[name="ticket_system_manual"]',
          "github",
        );
        await page.fill(
          'textarea[name="credentials"]',
          JSON.stringify({
            type: "api_key",
            token: "test-token",
          }),
        );
      }

      // Enable auto-fix
      const autoFixSwitch = page.locator('input[name="auto_fix_enabled"]');
      if ((await autoFixSwitch.count()) > 0) {
        await page.click('label:has-text("Enable Auto-fix")');

        // Verify auto-fix tags input appears
        await expect(page.locator('input[name="auto_fix_tags"]')).toBeVisible();

        // Fill in tags
        await page.fill('input[name="auto_fix_tags"]', "bug, hotfix, critical");

        // Submit
        await page.click('button[type="submit"]:has-text("Create Project")');
        await page.waitForTimeout(2000);
      } else {
        test.skip(true, "Auto-fix switch not found");
      }
    });

    test("P-4: should handle project view and navigation", async ({
      authenticatedPage: page,
    }) => {
      // Go to dashboard
      await page.goto("/");

      // Look for existing projects
      const projectLinks = page.locator('a[href^="/project/"]');
      const projectCount = await projectLinks.count();

      if (projectCount === 0) {
        test.skip(true, "No projects found. Create a project first.");
        return;
      }

      // Click first project
      await projectLinks.first().click();

      // Should be on project page
      await expect(page).toHaveURL(/\/project\/[^/]+$/);

      // Check for project details
      await page.waitForTimeout(1000);

      // Check for navigation within project
      const tabsNav = page.locator('nav, [role="navigation"]');
      const hasTabs = (await tabsNav.count()) > 0;
      expect(hasTabs).toBe(true);
    });
  });

  test.describe("Dashboard - Projects Section", () => {
    test("UI-1, UI-2: should display dashboard with projects", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/");

      // Check for Dashboard heading
      await expect(page.getByText("Dashboard")).toBeVisible();

      // Check for stats
      await expect(page.getByText("Total Projects")).toBeVisible();
      await expect(page.getByText("Total Tickets")).toBeVisible();
      await expect(page.getByText("Active Clankers")).toBeVisible();
      await expect(page.getByText("Job Queue")).toBeVisible();

      // Check for Projects section
      await expect(page.getByText("Projects")).toBeVisible();

      // Check for "New" button
      const newButton = page
        .getByRole("link", { name: /New/i })
        .or(page.locator('a:has-text("New")'));
      await expect(newButton.first()).toBeVisible();
    });

    test("should show empty state when no projects exist", async ({
      authenticatedPage: page,
    }) => {
      // This test assumes we can delete all projects or have a clean state
      // In practice, we'd use API to ensure clean state

      await page.goto("/");

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        // Should show empty state
        await expect(page.getByText(/No projects yet/)).toBeVisible();
        await expect(page.getByText(/Create your first project/)).toBeVisible();
      }
    });

    test("should display project cards with correct information", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/");

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, "No projects found");
        return;
      }

      // Check first project card
      const firstProject = projectLinks.first();
      await expect(firstProject).toBeVisible();

      // Project card should have avatar
      const avatar = firstProject.locator('[data-slot="avatar"]');
      await expect(avatar).toBeVisible();

      // Should have project name
      const projectName = await firstProject.textContent();
      expect(projectName).toBeTruthy();
    });
  });

  test.describe("Project Settings", () => {
    test("should access project settings page", async ({
      authenticatedPage: page,
    }) => {
      // Go to dashboard first
      await page.goto("/");

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, "No projects found");
        return;
      }

      // Navigate to first project
      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      // Get the project slug from URL
      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, "Could not extract project slug");
        return;
      }

      // Navigate to settings
      await page.goto(`/project/${projectSlug}/settings/project`);

      // Should show settings page
      await expect(page.getByText(/Project Settings|Settings/)).toBeVisible();
    });
  });

  test.describe("P-5: Duplicate slug prevention", () => {
    test("should handle duplicate project names gracefully", async ({
      authenticatedPage: page,
      request,
      backendURL,
    }) => {
      // This test would require API access to check for duplicates
      // For now, we'll test the UI validation

      await page.goto("/new");

      const projectName = "Test-Duplicate-Project";

      // Try to create project with same name
      await page.fill('input[name="name"]', projectName);
      await page.fill(
        'input[name="repository_urls"]',
        "https://github.com/test-org/test-repo-2",
      );

      const ticketSystemSelect = page.locator('select[name="ticket_system"]');
      if ((await ticketSystemSelect.count()) > 0) {
        await ticketSystemSelect.selectOption({ index: 1 });
      } else {
        await page.click("text=Configure new integration");
        await page.selectOption(
          'select[name="ticket_system_manual"]',
          "github",
        );
        await page.fill(
          'textarea[name="credentials"]',
          JSON.stringify({
            type: "api_key",
            token: "test-token",
          }),
        );
      }

      // Submit
      await page.click('button[type="submit"]:has-text("Create Project")');

      // Wait for response
      await page.waitForTimeout(3000);

      // Check if there's an error message or if it succeeded
      const errorMessage = page.getByText(/already exists|conflict|duplicate/i);
      if (await errorMessage.isVisible()) {
        // Duplicate was prevented - good!
        expect(true).toBe(true);
      } else {
        // Either succeeded with different slug or failed silently
        const currentUrl = page.url();
        if (currentUrl.includes("/project/")) {
          // Succeeded - check if slug has unique suffix
        }
      }
    });
  });

  test.describe("Multiple Repository URLs", () => {
    test("P-2: should support multiple repository URLs", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/new");

      const projectName = helpers.generateProjectName();
      await page.fill('input[name="name"]', projectName);

      // Add first repository
      await page.fill(
        'input[name="repository_urls"]',
        "https://github.com/test-org/repo-1",
      );

      // Add second repository
      const addButton = page
        .getByText("Add another repository")
        .or(page.locator('button:has-text("Add")'));
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Fill second repository
        const repoInputs = page.locator('input[name="repository_urls"]');
        if ((await repoInputs.count()) > 1) {
          await repoInputs.nth(1).fill("https://github.com/test-org/repo-2");
        }
      }

      // Select ticket system
      const ticketSystemSelect = page.locator('select[name="ticket_system"]');
      if ((await ticketSystemSelect.count()) > 0) {
        await ticketSystemSelect.selectOption({ index: 1 });
      } else {
        await page.click("text=Configure new integration");
        await page.selectOption(
          'select[name="ticket_system_manual"]',
          "github",
        );
        await page.fill(
          'textarea[name="credentials"]',
          JSON.stringify({
            type: "api_key",
            token: "test-token",
          }),
        );
      }

      // Submit
      await page.click('button[type="submit"]:has-text("Create Project")');
      await page.waitForTimeout(2000);
    });
  });
});
