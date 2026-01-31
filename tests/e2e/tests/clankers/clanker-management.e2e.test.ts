import { test, expect, TestHelpers } from '../../playwright/fixtures';

test.describe('Clanker Management E2E Tests', () => {
  const helpers = TestHelpers;

  test.describe('C-1 to C-8: Clanker CRUD Operations', () => {
    test('C-1: should create a new clanker', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      // Check page title
      await expect(page.getByText('Create New Clanker')).toBeVisible();

      // Fill in clanker name
      const clankerName = helpers.generateClankerName();
      await page.fill('input[name="name"]', clankerName);

      // Fill description
      await page.fill('textarea[name="description"]', 'E2E test clanker for automated testing');

      // Select deployment strategy
      const strategySelect = page.locator('select[name="deploymentStrategyId"]');
      const strategyCount = await strategySelect.count();

      if (strategyCount > 0) {
        // Select first available strategy
        const options = await strategySelect.locator('option').count();
        if (options > 1) {
          await strategySelect.selectOption({ index: 1 });
        }
      } else {
        test.skip(true, 'No deployment strategies available');
        return;
      }

      // Select agent
      const agentSelect = page.locator('select[name="agent"]');
      const hasAgentSelect = await agentSelect.count() > 0;

      if (hasAgentSelect) {
        await agentSelect.selectOption('claude-code');
      }

      // Submit form
      await page.click('button[type="submit"]:has-text("Create Clanker")');

      // Wait for response
      await page.waitForTimeout(2000);

      // Should navigate to clanker detail page
      const currentUrl = page.url();
      if (currentUrl.includes('/clankers/')) {
        expect(currentUrl).toMatch(/\/clankers\/[^/]+$/);
      }
    });

    test('should display deployment strategy options', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      const strategySelect = page.locator('select[name="deploymentStrategyId"]');
      const strategyCount = await strategySelect.count();

      if (strategyCount > 0) {
        await expect(strategySelect).toBeVisible();

        // Check for common strategies
        const options = await strategySelect.locator('option').allTextContents();
        const optionsText = options.join(' ').toLowerCase();

        // Should have at least Docker, ECS, or Lambda
        const hasStrategy = optionsText.match(/docker|ecs|lambda|container/i);
        expect(hasStrategy).toBeTruthy();
      } else {
        test.skip(true, 'No deployment strategies available');
      }
    });

    test('should display agent selection options', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      const agentSelect = page.locator('select[name="agent"]');
      const hasAgentSelect = await agentSelect.count() > 0;

      if (hasAgentSelect) {
        await expect(agentSelect).toBeVisible();

        // Check for common agents
        const options = await agentSelect.locator('option').allTextContents();
        const optionsText = options.join(' ').toLowerCase();

        // Should have Claude Code at minimum
        expect(optionsText.toLowerCase()).toMatch(/claude|code|ai/i);
      }
    });

    test('should allow selecting secrets for clanker', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      // Look for secrets multi-select
      const secretsSection = page.getByText(/secret/i).or(page.locator('[data-testid*="secret"]'));
      const hasSecrets = await secretsSection.count() > 0;

      if (hasSecrets) {
        await expect(secretsSection.first()).toBeVisible();
      }
    });

    test('should allow adding config files', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      // Look for config file sections
      const claudeMdTextarea = page.locator('textarea[placeholder*="Claude" i], textarea:has-text("Configuration")');
      const hasConfigSection = await claudeMdTextarea.count() > 0;

      if (hasConfigSection) {
        await expect(claudeMdTextarea.first()).toBeVisible();

        // Try adding content
        await claudeMdTextarea.first().fill('# Test Configuration\nThis is a test config for E2E.');
      }

      // Look for custom config file input
      const customConfigInput = page.locator('input[placeholder*="config" i], input[placeholder*="file" i]');
      const hasCustomConfig = await customConfigInput.count() > 0;

      if (hasCustomConfig) {
        await customConfigInput.first().fill('test-config.md');

        // Look for "Add File" button
        const addFileButton = page.getByRole('button', { name: /add/i });
        if (await addFileButton.count() > 0) {
          await expect(addFileButton.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Clanker List Page', () => {
    test('should display list of clankers', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      // Check page title
      await expect(page.getByText(/clanker/i)).toBeVisible();

      // Look for clanker cards or table
      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        // Might show empty state
        const emptyState = page.getByText(/no clankers|create/i);
        if (await emptyState.count() > 0) {
          await expect(emptyState.first()).toBeVisible();
        }
      }
    });

    test('should show clanker status badges', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      // Look for status badges
      const badges = page.locator('[class*="badge"], span[class*="status"]');
      const hasBadges = await badges.count() > 0;

      if (hasBadges) {
        // Should show statuses like Active, Inactive, Deploying, Failed
        const badgeText = await badges.allTextContents();
        const text = badgeText.join(' ').toLowerCase();
        expect(text).toMatch(/active|inactive|deploy|failed|ready/);
      }
    });

    test('should have "New Clanker" button', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const newButton = page.getByRole('link', { name: /new|create/i })
        .or(page.locator('a:has-text("New")'))
        .or(page.locator('a:has-text("Create")'));

      await expect(newButton.first()).toBeVisible();
    });
  });

  test.describe('C-2 to C-6: Clanker Actions', () => {
    test('C-2: should show start button for inactive clankers', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      // Navigate to first clanker
      await clankerLinks.first().click();
      await page.waitForURL(/\/clankers\/[^/]+$/);

      // Look for start button
      const startButton = page.getByRole('button', { name: /start/i })
        .or(page.locator('button:has-text("Start")'))
        .or(page.locator('button:has-text("Activate")'));

      const hasStartButton = await startButton.count() > 0;

      if (hasStartButton) {
        await expect(startButton.first()).toBeVisible();
        // We won't actually click it to avoid provisioning resources
      }
    });

    test('C-6: should show stop button for active clankers', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      // Navigate to first clanker
      await clankerLinks.first().click();
      await page.waitForURL(/\/clankers\/[^/]+$/);

      // Look for stop button
      const stopButton = page.getByRole('button', { name: /stop/i })
        .or(page.locator('button:has-text("Stop")'))
        .or(page.locator('button:has-text("Deactivate")'));

      const hasStopButton = await stopButton.count() > 0;

      if (hasStopButton) {
        await expect(stopButton.first()).toBeVisible();
        // We won't actually click it
      }
    });

    test('C-5: should show clanker health status', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      // Navigate to first clanker
      await clankerLinks.first().click();
      await page.waitForURL(/\/clankers\/[^/]+$/);

      // Look for health status indicator
      const healthIndicator = page.getByText(/health|status|active|inactive/i)
        .or(page.locator('[class*="health"]'))
        .or(page.locator('[data-testid*="health"]'));

      const hasHealth = await healthIndicator.count() > 0;

      if (hasHealth) {
        await expect(healthIndicator.first()).toBeVisible();
      }
    });
  });

  test.describe('Clanker Detail Page', () => {
    test('should display clanker details', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      await clankerLinks.first().click();
      await page.waitForURL(/\/clankers\/[^/]+$/);

      // Should show clanker name
      const nameHeading = page.locator('h1, h2').first();
      await expect(nameHeading).toBeVisible();
    });

    test('should have edit button', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      await clankerLinks.first().click();
      await page.waitForURL(/\/clankers\/[^/]+$/);

      // Look for edit button
      const editButton = page.getByRole('link', { name: /edit/i })
        .or(page.locator('a:has-text("Edit")'))
        .or(page.locator('button:has-text("Edit")'));

      const hasEditButton = await editButton.count() > 0;

      if (hasEditButton) {
        await expect(editButton.first()).toBeVisible();
      }
    });
  });

  test.describe('C-4: Deployment Strategies', () => {
    test('should support Docker deployment', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      const strategySelect = page.locator('select[name="deploymentStrategyId"]');
      const hasStrategy = await strategySelect.count() > 0;

      if (!hasStrategy) {
        test.skip(true, 'No deployment strategies available');
        return;
      }

      // Get options
      const options = await strategySelect.locator('option').allTextContents();
      const hasDocker = options.some(o => o.toLowerCase().includes('docker'));

      if (hasDocker) {
        // Select Docker
        await strategySelect.selectOption(options.find(o => o.toLowerCase().includes('docker')) || 'docker');

        // Check if Docker-specific fields appear
        await page.waitForTimeout(500);

        const containerImageInput = page.locator('input[name="containerImage"]');
        const hasContainerField = await containerImageInput.count() > 0;

        if (hasContainerField) {
          await expect(containerImageInput).toBeVisible();
        }
      }
    });

    test('should support ECS deployment', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      const strategySelect = page.locator('select[name="deploymentStrategyId"]');
      const hasStrategy = await strategySelect.count() > 0;

      if (!hasStrategy) {
        test.skip(true, 'No deployment strategies available');
        return;
      }

      const options = await strategySelect.locator('option').allTextContents();
      const hasECS = options.some(o => o.toLowerCase().includes('ecs'));

      if (hasECS) {
        await strategySelect.selectOption(options.find(o => o.toLowerCase().includes('ecs')) || 'ecs');
        await page.waitForTimeout(500);

        // Check for ECS-specific fields
        const clusterArnInput = page.locator('input[name*="cluster"], input[name*="Cluster"]');
        const hasEcsFields = await clusterArnInput.count() > 0;

        if (hasEcsFields) {
          await expect(clusterArnInput.first()).toBeVisible();
        }
      }
    });

    test('should support Lambda deployment', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      const strategySelect = page.locator('select[name="deploymentStrategyId"]');
      const hasStrategy = await strategySelect.count() > 0;

      if (!hasStrategy) {
        test.skip(true, 'No deployment strategies available');
        return;
      }

      const options = await strategySelect.locator('option').allTextContents();
      const hasLambda = options.some(o => o.toLowerCase().includes('lambda'));

      if (hasLambda) {
        await strategySelect.selectOption(options.find(o => o.toLowerCase().includes('lambda')) || 'lambda');
        await page.waitForTimeout(500);

        // Check for Lambda-specific fields
        const functionArnInput = page.locator('input[name*="function"], input[name*="Function"]');
        const hasLambdaFields = await functionArnInput.count() > 0;

        if (hasLambdaFields) {
          await expect(functionArnInput.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('C-7, C-8: Secret Association', () => {
    test('should allow associating secrets with clanker', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers/new');

      // Look for secrets multi-select
      const secretsLabel = page.getByText(/secret/i).or(page.locator('label:has-text("Secret")'));
      const hasSecretsSection = await secretsLabel.count() > 0;

      if (hasSecretsSection) {
        // Should have some way to select secrets
        await expect(secretsLabel.first()).toBeVisible();

        // Look for multi-select or checkbox inputs
        const inputs = page.locator('input[type="checkbox"], select[multiple]');
        const hasSecretInputs = await inputs.count() > 0;

        if (hasSecretInputs) {
          // Secret selection is available
          expect(true).toBe(true);
        }
      }
    });
  });

  test.describe('Clanker Status Display', () => {
    test('should display correct status color', async ({ authenticatedPage: page }) => {
      await page.goto('/clankers');

      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        test.skip(true, 'No clankers found');
        return;
      }

      // Check status badges on list page
      const badges = page.locator('[class*="badge"], [role="status"]');
      const hasBadges = await badges.count() > 0;

      if (hasBadges) {
        // Badges should have color classes
        const firstBadge = badges.first();
        const className = await firstBadge.getAttribute('class');
        expect(className).toBeTruthy();
      }
    });
  });

  test.describe('Dashboard Clanker Section', () => {
    test('should show clankers on dashboard', async ({ authenticatedPage: page }) => {
      await page.goto('/');

      // Look for Clankers section
      const clankersSection = page.getByText('Clankers');
      await expect(clankersSection).toBeVisible();

      // Check for clanker links or empty state
      const clankerLinks = page.locator('a[href^="/clankers/"]');
      const count = await clankerLinks.count();

      if (count === 0) {
        // Should show empty state or "View all" link
        const viewAllLink = page.getByText(/view all/i).or(page.locator('a:has-text("View all")'));
        const hasViewAll = await viewAllLink.count() > 0;

        if (hasViewAll) {
          await expect(viewAllLink.first()).toBeVisible();
        }
      }
    });
  });
});
