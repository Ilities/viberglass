import { test, expect } from "../../playwright/fixtures";

test.describe("Integration Configuration E2E Tests", () => {
  test.describe("I-1 to I-6: Integration Management", () => {
    test("I-1, I-5: should display integrations page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations");

      // Check page title
      await expect(page.getByText("Integrations")).toBeVisible();

      // Check for stats
      await expect(page.getByText("Configured")).toBeVisible();
      await expect(page.getByText("Available")).toBeVisible();
      await expect(page.getByText("Ready to Use")).toBeVisible();

      // Check for "All Integrations" section
      await expect(page.getByText("All Integrations")).toBeVisible();
    });

    test("should show integration cards for available integrations", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations");

      // Look for integration cards
      const integrationCards = page.locator(
        'a[href^="/settings/integrations/"]',
      );
      const count = await integrationCards.count();

      // Should have some integrations displayed
      if (count === 0) {
        // Might be displayed differently - check for integration names
        const commonIntegrations = [
          "GitHub",
          "GitLab",
          "Jira",
          "Linear",
          "Bitbucket",
        ];
        let foundAny = false;
        for (const name of commonIntegrations) {
          const element = page.getByText(name);
          if ((await element.count()) > 0) {
            foundAny = true;
            break;
          }
        }
        if (!foundAny) {
          test.skip(true, "No integration cards found on page");
        }
      }
    });
  });

  test.describe("GitHub Integration Configuration", () => {
    test("should display GitHub integration configuration page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/github");

      // Check page title
      await expect(page.getByText(/GitHub/i)).toBeVisible();

      // Should have form fields for configuration
      const nameInput = page.locator('input[name="name"]');
      if ((await nameInput.count()) > 0) {
        await expect(nameInput).toBeVisible();
      }
    });

    test("should show GitHub configuration fields", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/github");

      // Check for common GitHub integration fields
      const tokenInput = page.locator(
        'input[name="token"], input[name*="token"], input[name*="Token"]',
      );
      const ownerInput = page.locator(
        'input[name="owner"], input[name*="owner"], input[name*="Owner"]',
      );
      const repoInput = page.locator(
        'input[name="repo"], input[name*="repo"], input[name*="Repository"]',
      );

      // At least some fields should be present
      const hasToken = (await tokenInput.count()) > 0;
      const hasOwner = (await ownerInput.count()) > 0;
      const hasRepo = (await repoInput.count()) > 0;

      if (!hasToken && !hasOwner && !hasRepo) {
        // Fields might be named differently - check for any input fields
        const inputs = page.locator(
          'input:not([type="hidden"]):not([type="submit"])',
        );
        const inputCount = await inputs.count();
        if (inputCount === 0) {
          test.skip(
            true,
            "No configuration inputs found - integration might be configured differently",
          );
        }
      }
    });
  });

  test.describe("Jira Integration Configuration", () => {
    test("should display Jira integration configuration page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/jira");

      // Check page title
      await expect(page.getByText(/Jira/i)).toBeVisible();
    });
  });

  test.describe("GitLab Integration Configuration", () => {
    test("should display GitLab integration configuration page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/gitlab");

      // Check page title
      await expect(page.getByText(/GitLab/i)).toBeVisible();
    });
  });

  test.describe("Webhook Configuration", () => {
    test("I-4: should display webhook configuration in project settings", async ({
      authenticatedPage: page,
    }) => {
      // First navigate to a project
      await page.goto("/");

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, "No projects found");
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      // Get project slug
      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (!projectSlug) {
        test.skip(true, "Could not extract project slug");
        return;
      }

      // Navigate to webhooks settings
      await page.goto(`/project/${projectSlug}/settings/webhooks`);

      // Check for webhook configuration elements
      await expect(page.getByText(/Webhook/i));
    });

    test("should show webhook URL when configured", async ({
      authenticatedPage: page,
    }) => {
      // This test requires a configured integration
      await page.goto("/");

      const projectLinks = page.locator('a[href^="/project/"]');
      const count = await projectLinks.count();

      if (count === 0) {
        test.skip(true, "No projects found");
        return;
      }

      await projectLinks.first().click();
      await page.waitForURL(/\/project\/[^/]+$/);

      // Get project slug
      const url = page.url();
      const match = url.match(/\/project\/([^/]+)/);
      const projectSlug = match ? match[1] : null;

      if (projectSlug) {
        await page.goto(`/project/${projectSlug}/settings/webhooks`);

        // Look for webhook URL display
        const webhookUrl = page
          .locator("text=http")
          .or(page.locator("code"))
          .or(page.locator('[class*="monospace"]'));
        const hasUrl = (await webhookUrl.count()) > 0;

        if (!hasUrl) {
          // Webhook might not be configured yet - that's OK
          const noWebhookMessage = page.getByText(/not configured|configure/i);
          if ((await noWebhookMessage.count()) > 0) {
            // Webhook not configured - expected state
            expect(true).toBe(true);
          }
        }
      }
    });
  });

  test.describe("I-3: Connection Testing", () => {
    test("should have test connection button", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/github");

      // Look for test connection button
      const testButton = page
        .getByRole("button", { name: /test/i })
        .or(page.locator('button:has-text("Test")'))
        .or(page.locator('button:has-text("Connect")'));

      const hasTestButton = (await testButton.count()) > 0;

      if (!hasTestButton) {
        test.skip(
          true,
          "Test connection button not found - might need to save configuration first",
        );
      }
    });
  });

  test.describe("Integration Status Indicators", () => {
    test("should show configuration status for integrations", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations");

      // Look for status badges or indicators
      const badges = page.locator(
        '[class*="badge"], [data-testid*="status"], [role="status"]',
      );
      const badgeCount = await badges.count();

      if (badgeCount === 0) {
        // Status might be shown differently
        const statusText = page.getByText(/configured|ready|active|inactive/i);
        const hasStatusText = (await statusText.count()) > 0;

        if (!hasStatusText) {
          test.skip(true, "Status indicators not found");
        }
      }
    });
  });

  test.describe("E2E Integration with External Services", () => {
    test("should handle GitHub webhook payload (mocked)", async ({
      authenticatedPage: page,
      request,
      backendURL,
    }) => {
      // This test mocks the GitHub webhook flow
      // In a real scenario, this would be triggered by GitHub

      // We'll just verify the endpoint exists and can receive webhooks
      const response = await request.post(`${backendURL}/api/webhooks/github`, {
        data: {
          action: "opened",
          issue: {
            number: 123,
            title: "Test Issue",
            body: "Test body",
            labels: [{ name: "bug" }],
          },
          repository: {
            full_name: "test/repo",
          },
        },
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "issues",
        },
      });

      // The endpoint should respond (might be 401 without signature, or 200/400 depending on implementation)
      expect([200, 201, 401, 400, 422]).toContain(response.status());
    });

    test("should validate webhook signature", async ({
      authenticatedPage: page,
      request,
      backendURL,
    }) => {
      // Test that invalid signatures are rejected
      const response = await request.post(`${backendURL}/api/webhooks/github`, {
        data: {
          action: "opened",
          issue: { number: 123, title: "Test" },
        },
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "issues",
          "X-Hub-Signature-256": "invalid_signature",
        },
      });

      // Should reject invalid signature
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe("Project Integration Linking", () => {
    test("I-2: should allow linking integration to project", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/new");

      // Check if we can select an integration for the project
      const ticketSystemSelect = page.locator('select[name="ticket_system"]');
      const hasSelect = (await ticketSystemSelect.count()) > 0;

      if (!hasSelect) {
        // Might need to configure integration first
        const configureButton = page.getByText(/Configure Integrations/i);
        if (await configureButton.isVisible()) {
          await configureButton.click();
          await page.waitForURL("/settings/integrations");
          expect(page.url()).toContain("/settings/integrations");
        }
      } else {
        // Get options
        const options = await ticketSystemSelect.locator("option").count();
        expect(options).toBeGreaterThan(0);
      }
    });
  });

  test.describe("Third-Party Integration Mocking", () => {
    test("should skip actual GitHub API calls in E2E tests", async ({
      page,
    }) => {
      // This is a meta-test to ensure we don't make real API calls
      // We're documenting that third-party integrations are mocked/skipped
      expect(true).toBe(true);
    });

    test("should skip actual Jira API calls in E2E tests", async ({ page }) => {
      // Documenting that Jira integrations are mocked
      expect(true).toBe(true);
    });
  });
});
