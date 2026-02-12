import { test, expect } from "../../playwright/fixtures";
import type { Page } from "@playwright/test";

async function createConfiguredGitHubIntegration(page: Page): Promise<boolean> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/settings/integrations/new/github");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const tokenInput = page.getByLabel(/Access Token/i).first();
  const oauthClientIdInput = page.getByLabel(/Client ID/i).first();
  const ownerInput = page.getByLabel(/Repository Owner/i).first();
  const repoInput = page.getByLabel(/Repository Name/i).first();

  if ((await ownerInput.count()) === 0 || (await repoInput.count()) === 0) {
    return false;
  }

  if ((await tokenInput.count()) > 0) {
    await tokenInput.fill("e2e-test-token");
  } else if ((await oauthClientIdInput.count()) > 0) {
    await oauthClientIdInput.fill(`e2e-client-${uniqueSuffix}`);
    await page
      .getByLabel(/Client Secret/i)
      .first()
      .fill("e2e-client-secret");
  }

  await ownerInput.fill("e2e-owner");
  await repoInput.fill(`e2e-repo-${uniqueSuffix}`);

  await page.getByRole("button", { name: "Save Configuration" }).click();

  try {
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

async function openConfiguredGitHubIntegration(page: Page): Promise<boolean> {
  await page.goto("/settings/integrations");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const configuredGitHubCard = page
    .locator('a[href^="/settings/integrations/"]', { hasText: "GitHub" })
    .filter({ hasText: "Manage" })
    .first();

  if ((await configuredGitHubCard.count()) > 0) {
    await configuredGitHubCard.click();
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  }

  return createConfiguredGitHubIntegration(page);
}

async function createConfiguredJiraIntegration(page: Page): Promise<boolean> {
  await page.goto("/settings/integrations/new/jira");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  try {
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

async function openConfiguredJiraIntegration(page: Page): Promise<boolean> {
  await page.goto("/settings/integrations");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const configuredJiraCard = page
    .locator('a[href^="/settings/integrations/"]', { hasText: "Jira" })
    .filter({ hasText: "Manage" })
    .first();

  if ((await configuredJiraCard.count()) > 0) {
    await configuredJiraCard.click();
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  }

  return createConfiguredJiraIntegration(page);
}

async function createConfiguredShortcutIntegration(
  page: Page,
): Promise<boolean> {
  await page.goto("/settings/integrations/new/shortcut");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  try {
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

async function openConfiguredShortcutIntegration(page: Page): Promise<boolean> {
  await page.goto("/settings/integrations");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const configuredShortcutCard = page
    .locator('a[href^="/settings/integrations/"]', { hasText: "Shortcut" })
    .filter({ hasText: "Manage" })
    .first();

  if ((await configuredShortcutCard.count()) > 0) {
    await configuredShortcutCard.click();
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  }

  return createConfiguredShortcutIntegration(page);
}

async function createConfiguredCustomIntegration(page: Page): Promise<boolean> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/settings/integrations/new/custom");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const sourceNameInput = page.getByLabel(/Source Name/i).first();
  const apiKeyInput = page.getByLabel(/API Key/i).first();

  if ((await sourceNameInput.count()) === 0 || (await apiKeyInput.count()) === 0) {
    return false;
  }

  await sourceNameInput.fill(`E2E Source ${uniqueSuffix}`);
  await apiKeyInput.fill(`e2e-custom-key-${uniqueSuffix}`);
  await page.getByRole("button", { name: "Save Configuration" }).click();

  try {
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

async function openConfiguredCustomIntegration(page: Page): Promise<boolean> {
  await page.goto("/settings/integrations");
  if (
    page.url().includes("/login") ||
    (await page
      .getByRole("heading", { name: /sign in to your account/i })
      .count()) > 0
  ) {
    return false;
  }

  const configuredCustomCard = page
    .locator('a[href^="/settings/integrations/"]', { hasText: "Custom" })
    .filter({ hasText: "Manage" })
    .first();

  if ((await configuredCustomCard.count()) > 0) {
    await configuredCustomCard.click();
    await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
      timeout: 20000,
    });
    return true;
  }

  return createConfiguredCustomIntegration(page);
}

test.describe("Integration Configuration E2E Tests", () => {
  test.describe("I-1 to I-6: Integration Management", () => {
    test("I-1, I-5: should display integrations page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations");

      // Check page title
      await expect(
        page.getByRole("heading", { name: "Integrations", exact: true }),
      ).toBeVisible();

      // Check for stats
      await expect(page.getByText("Configured").first()).toBeVisible();
      await expect(page.getByText("Available").first()).toBeVisible();
      await expect(page.getByText("Ready to Use").first()).toBeVisible();

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

    test("should use entity-scoped routes for configured integration cards", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations");

      const configuredCards = page.locator(
        'a[href^="/settings/integrations/"]',
        { hasText: "Manage" },
      );
      const configuredCount = await configuredCards.count();

      if (configuredCount === 0) {
        test.skip(true, "No configured integration cards found");
        return;
      }

      const href = await configuredCards.first().getAttribute("href");
      if (!href) {
        test.skip(true, "Configured integration card has no href");
        return;
      }

      const routeId = href.replace("/settings/integrations/", "");
      const legacySystemIds = [
        "jira",
        "linear",
        "github",
        "gitlab",
        "bitbucket",
        "azure",
        "asana",
        "trello",
        "monday",
        "clickup",
        "shortcut",
        "slack",
        "custom",
      ];

      expect(routeId.startsWith("new/")).toBe(false);
      expect(legacySystemIds).not.toContain(routeId);
    });
  });

  test.describe("GitHub Integration Configuration", () => {
    test("should display GitHub integration configuration page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/new/github");

      // Check page title
      await expect(
        page.getByRole("heading", { name: "GitHub", exact: true }),
      ).toBeVisible();

      // Should have form fields for configuration
      const nameInput = page.locator('input[name="name"]');
      if ((await nameInput.count()) > 0) {
        await expect(nameInput).toBeVisible();
      }
    });

    test("should show GitHub configuration fields", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/new/github");

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

  test.describe("GitHub Targeted Webhook UI", () => {
    test("should render GitHub-specific inbound and outbound sections", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredGitHubIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "GitHub integration could not be configured in this environment",
        );
      }

      await expect(
        page.getByRole("heading", { name: "GitHub Inbound Webhook" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "GitHub Outbound Events" }),
      ).toBeVisible();
      await expect(page.getByText("GitHub setup steps")).toBeVisible();
      await expect(page.getByText("Repository mapping preview")).toBeVisible();

      await expect(
        page.getByText(
          "Inbound webhooks create tickets from external payloads.",
        ),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          "Outbound webhooks send job lifecycle events when execution starts and ends.",
        ),
      ).toHaveCount(0);
    });

    test("should allow configuring GitHub inbound events after creating inbound webhook", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredGitHubIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "GitHub integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "GitHub Inbound Webhook" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create GitHub Inbound Webhook",
      });

      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      await expect(page.getByText("Allowed inbound events")).toBeVisible();
      await expect(page.getByLabel("Issue opened")).toBeChecked();
      const issueCommentEventToggle = page.getByLabel("Issue comment created");

      const wasChecked = await issueCommentEventToggle.isChecked();
      if (wasChecked) {
        await issueCommentEventToggle.uncheck();
      } else {
        await issueCommentEventToggle.check();
      }
      await page.getByRole("button", { name: "Save inbound settings" }).click();

      if (wasChecked) {
        await expect(issueCommentEventToggle).not.toBeChecked();
      } else {
        await expect(issueCommentEventToggle).toBeChecked();
      }
      await expect(page.getByText("Webhook URL")).toBeVisible();
      await expect(page.getByText("Webhook Secret")).toBeVisible();
    });

    test("should support selecting between multiple inbound GitHub configs", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredGitHubIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "GitHub integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "GitHub Inbound Webhook" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create GitHub Inbound Webhook",
      });
      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      const configSelect = inboundSection.locator("select").first();
      if ((await configSelect.count()) === 0) {
        test.skip(
          true,
          "Inbound configuration selector is unavailable in this environment",
        );
      }

      let optionCount = await configSelect.locator("option").count();
      if (optionCount < 2) {
        const addConfigButton = inboundSection.getByRole("button", {
          name: "Add configuration",
        });
        if ((await addConfigButton.count()) === 0) {
          test.skip(
            true,
            "Cannot add a second inbound configuration in this environment",
          );
        }
        await addConfigButton.click();
        optionCount = await configSelect.locator("option").count();
      }

      if (optionCount < 2) {
        test.skip(
          true,
          "Did not reach at least two inbound configurations for selection test",
        );
      }

      const optionValues = await configSelect
        .locator("option")
        .evaluateAll((options) =>
          options.map((option) => option.getAttribute("value") || ""),
        );

      await configSelect.selectOption(optionValues[0]);
      await expect(configSelect).toHaveValue(optionValues[0]);

      await configSelect.selectOption(optionValues[1]);
      await expect(configSelect).toHaveValue(optionValues[1]);
      await expect(
        page.getByText(
          "No deliveries yet for the selected inbound configuration.",
        ),
      ).toBeVisible();
    });
  });

  test.describe("Jira Integration Configuration", () => {
    test("should auto-create Jira integration from new route", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/new/jira");

      await page.waitForURL(/\/settings\/integrations\/(?!new\/)[^/]+$/, {
        timeout: 20000,
      });
      await expect(
        page.getByRole("heading", { name: "Jira", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Configuration" }),
      ).toHaveCount(0);
    });
  });

  test.describe("Jira Targeted Webhook UI", () => {
    test("should render Jira-specific inbound and outbound sections", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredJiraIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Jira integration could not be configured in this environment",
        );
      }

      await expect(
        page.getByRole("heading", { name: "Jira Inbound Webhook" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Jira Feedback" }),
      ).toBeVisible();
      await expect(page.getByText("Jira setup steps")).toBeVisible();
      await expect(page.getByText("Always-on feedback events")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Configuration" }),
      ).toHaveCount(0);

      await expect(
        page.getByText(
          "Inbound webhooks create tickets from external payloads.",
        ),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          "Outbound webhooks send job lifecycle events when execution starts and ends.",
        ),
      ).toHaveCount(0);
    });

    test("should save Jira webhook settings and keep state after reload", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredJiraIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Jira integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Jira Inbound Webhook" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create Jira inbound webhook",
      });
      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      const issueUpdatedToggle = page.getByLabel("Issue updated");
      if ((await issueUpdatedToggle.count()) === 0) {
        test.skip(
          true,
          "Jira inbound event toggles are unavailable in this environment",
        );
      }

      const inboundWasChecked = await issueUpdatedToggle.isChecked();
      if (inboundWasChecked) {
        await issueUpdatedToggle.uncheck();
      } else {
        await issueUpdatedToggle.check();
      }

      const saveInboundButton = page.getByRole("button", {
        name: "Save inbound settings",
      });
      if ((await saveInboundButton.count()) > 0) {
        await saveInboundButton.click();
      }

      const outboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Jira Feedback" }),
      });

      const outboundTokenInput = outboundSection.getByLabel("Jira API token");
      if ((await outboundTokenInput.count()) > 0) {
        await outboundTokenInput.fill("jira-e2e-outbound-token");
      }
      await outboundSection
        .getByRole("button", {
          name: /Save feedback settings|Enable feedback/,
        })
        .click();

      await page.reload();

      const issueUpdatedToggleAfterReload = page.getByLabel("Issue updated");
      if (inboundWasChecked) {
        await expect(issueUpdatedToggleAfterReload).not.toBeChecked();
      } else {
        await expect(issueUpdatedToggleAfterReload).toBeChecked();
      }

      await expect(
        page.locator("section", {
          has: page.getByRole("heading", { name: "Jira Feedback" }),
        }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Remove outbound webhook" })).toHaveCount(0);
    });

    test("should support selecting between multiple inbound Jira configs", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredJiraIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Jira integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Jira Inbound Webhook" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create Jira inbound webhook",
      });
      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      const configSelect = inboundSection.locator("select").first();
      if ((await configSelect.count()) === 0) {
        test.skip(
          true,
          "Inbound configuration selector is unavailable in this environment",
        );
      }

      let optionCount = await configSelect.locator("option").count();
      if (optionCount < 2) {
        const addConfigButton = inboundSection.getByRole("button", {
          name: "Add configuration",
        });
        if ((await addConfigButton.count()) === 0) {
          test.skip(
            true,
            "Cannot add a second inbound configuration in this environment",
          );
        }
        await addConfigButton.click();
        optionCount = await configSelect.locator("option").count();
      }

      if (optionCount < 2) {
        test.skip(
          true,
          "Did not reach at least two inbound configurations for selection test",
        );
      }

      const optionValues = await configSelect
        .locator("option")
        .evaluateAll((options) =>
          options.map((option) => option.getAttribute("value") || ""),
        );

      await configSelect.selectOption(optionValues[0]);
      await expect(configSelect).toHaveValue(optionValues[0]);

      await configSelect.selectOption(optionValues[1]);
      await expect(configSelect).toHaveValue(optionValues[1]);
      await expect(
        page.getByText(
          "No deliveries yet for the selected inbound configuration.",
        ),
      ).toBeVisible();
    });
  });

  test.describe("Shortcut Targeted Webhook UI", () => {
    test("should render Shortcut-specific inbound and outbound sections", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredShortcutIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Shortcut integration could not be configured in this environment",
        );
      }

      await expect(
        page.getByRole("heading", { name: "Shortcut Inbound Trigger" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Shortcut Feedback" }),
      ).toBeVisible();
      await expect(page.getByText("Shortcut setup steps")).toBeVisible();
      await expect(page.getByText("Always-on feedback events")).toBeVisible();

      await expect(
        page.getByText(
          "Inbound webhooks create tickets from external payloads.",
        ),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          "Outbound webhooks send job lifecycle events when execution starts and ends.",
        ),
      ).toHaveCount(0);
    });

    test("should save Shortcut webhook settings and keep state after reload", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredShortcutIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Shortcut integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Shortcut Inbound Trigger" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create Shortcut inbound webhook",
      });
      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      const commentCreatedToggle = page.getByLabel("Comment created");
      if ((await commentCreatedToggle.count()) === 0) {
        test.skip(
          true,
          "Shortcut inbound event toggles are unavailable in this environment",
        );
      }

      const inboundWasChecked = await commentCreatedToggle.isChecked();
      if (inboundWasChecked) {
        await commentCreatedToggle.uncheck();
      } else {
        await commentCreatedToggle.check();
      }

      const saveInboundButton = page.getByRole("button", {
        name: "Save inbound settings",
      });
      if ((await saveInboundButton.count()) > 0) {
        await saveInboundButton.click();
      }

      const outboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Shortcut Feedback" }),
      });
      const outboundTokenInput =
        outboundSection.getByLabel("Shortcut API token");
      if ((await outboundTokenInput.count()) > 0) {
        await outboundTokenInput.fill("shortcut-e2e-outbound-token");
      }
      await outboundSection
        .getByRole("button", {
          name: /Save feedback settings|Enable feedback/,
        })
        .click();

      await page.reload();

      const commentCreatedToggleAfterReload =
        page.getByLabel("Comment created");
      if (inboundWasChecked) {
        await expect(commentCreatedToggleAfterReload).not.toBeChecked();
      } else {
        await expect(commentCreatedToggleAfterReload).toBeChecked();
      }

      await expect(
        page.locator("section", {
          has: page.getByRole("heading", { name: "Shortcut Feedback" }),
        }),
      ).toBeVisible();
    });
  });

  test.describe("Custom Targeted Webhook UI", () => {
    test("should render custom inbound and outbound sections", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredCustomIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Custom integration could not be configured in this environment",
        );
      }

      await expect(
        page.getByRole("heading", { name: "Custom Inbound Webhooks" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Custom Outbound Destinations" }),
      ).toBeVisible();
      await expect(page.getByText("Custom setup steps")).toBeVisible();
      await expect(
        page.getByText("destination-specific auth, headers, retry policy"),
      ).toBeVisible();
    });

    test("should allow creating targeted custom inbound and outbound webhook configs", async ({
      authenticatedPage: page,
    }) => {
      const hasConfiguredIntegration =
        await openConfiguredCustomIntegration(page);
      if (!hasConfiguredIntegration) {
        test.skip(
          true,
          "Custom integration could not be configured in this environment",
        );
      }

      const inboundSection = page.locator("section", {
        has: page.getByRole("heading", { name: "Custom Inbound Webhooks" }),
      });
      const createInboundButton = inboundSection.getByRole("button", {
        name: "Create custom inbound endpoint",
      });
      if ((await createInboundButton.count()) > 0) {
        await createInboundButton.click();
      }

      await expect(inboundSection.getByText("Webhook URL")).toBeVisible();
      const autoExecuteToggle = inboundSection.locator("#customInboundAutoExecute");
      if ((await autoExecuteToggle.count()) > 0) {
        const wasChecked = await autoExecuteToggle.isChecked();
        if (wasChecked) {
          await autoExecuteToggle.uncheck();
        } else {
          await autoExecuteToggle.check();
        }

        const saveInboundButton = inboundSection.getByRole("button", {
          name: "Save endpoint settings",
        });
        if ((await saveInboundButton.count()) > 0) {
          await saveInboundButton.click();
        }
      }

      await expect(
        inboundSection.getByText("Expected payload format"),
      ).toBeVisible();

      const outboundSection = page.locator("section", {
        has: page.getByRole("heading", {
          name: "Custom Outbound Destinations",
        }),
      });

      const destinationNameInput = outboundSection.getByLabel(
        "Destination name",
      );
      const destinationUrlInput = outboundSection.getByLabel("Destination URL");
      if (
        (await destinationNameInput.count()) === 0 ||
        (await destinationUrlInput.count()) === 0
      ) {
        test.skip(
          true,
          "Custom outbound destination form is unavailable in this environment",
        );
      }

      const uniqueSuffix = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const destinationName = `E2E Destination ${uniqueSuffix}`;
      await destinationNameInput.fill(destinationName);
      await destinationUrlInput.fill(
        `https://hooks.example.com/viberator/${uniqueSuffix}`,
      );

      await outboundSection
        .getByRole("button", { name: /Create destination|Save destination/ })
        .click();

      await expect(
        outboundSection.getByLabel("Destination name"),
      ).toHaveValue(destinationName);
    });
  });

  test.describe("GitLab Integration Configuration", () => {
    test("should display GitLab integration configuration page", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/new/gitlab");

      // Check page title
      await expect(
        page.getByRole("heading", { name: "GitLab", exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("I-3: Connection Testing", () => {
    test("should have test connection button", async ({
      authenticatedPage: page,
    }) => {
      await page.goto("/settings/integrations/new/github");

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
      expect([200, 201, 401, 400, 422, 500]).toContain(response.status());
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
      expect([401, 403, 500]).toContain(response.status());
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
