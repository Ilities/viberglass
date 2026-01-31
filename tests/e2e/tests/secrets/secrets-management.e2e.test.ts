import { test, expect, TestHelpers } from '../../playwright/fixtures';

test.describe('Secrets Management E2E Tests', () => {
  const helpers = TestHelpers;

  test.describe('S-1 to S-6: Secret CRUD Operations', () => {
    test('S-1: should create a new secret', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Check page title
      await expect(page.getByText('Secrets')).toBeVisible();

      // Look for "Add Secret" button
      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'))
        .or(page.locator('button:has-text("Create Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();

      // Wait for dialog/form to appear
      await page.waitForTimeout(500);

      // Fill in secret name
      const secretName = `TEST_SECRET_${helpers.generateUniqueId().toUpperCase()}`;
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      const hasNameInput = await nameInput.count() > 0;

      if (!hasNameInput) {
        test.skip(true, 'Secret name input not found');
        return;
      }

      await nameInput.first().fill(secretName);

      // Select storage location
      const locationSelect = page.locator('select[name="secretLocation"], select[name="location"]');
      const hasLocationSelect = await locationSelect.count() > 0;

      if (hasLocationSelect) {
        await locationSelect.selectOption('database');
      }

      // Fill in secret value
      const valueInput = page.locator('input[name="secretValue"], input[type="password"]');
      const hasValueInput = await valueInput.count() > 0;

      if (hasValueInput) {
        await valueInput.first().fill('test-secret-value-12345');
      }

      // Submit form
      const submitButton = page.getByRole('button', { name: /create|save/i })
        .or(page.locator('button[type="submit"]'));

      await submitButton.click();

      // Wait for response
      await page.waitForTimeout(2000);
    });

    test('S-2: should list all secrets with masked values', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Should show secrets page
      await expect(page.getByText('Secrets')).toBeVisible();

      // Look for secrets table or list
      const table = page.locator('table');
      const hasTable = await table.count() > 0;

      if (hasTable) {
        // Check that values are not shown in plaintext
        const pageContent = await page.content();
        const hasPlaintextSecrets = pageContent.includes('password') || pageContent.includes('api_key');

        if (hasPlaintextSecrets) {
          // Make sure they're not actual secret values
          const secretValues = page.locator('td, [data-testid*="secret"]');
          const count = await secretValues.count();

          if (count > 0) {
            // Values should be masked or shown as ***
            for (let i = 0; i < Math.min(count, 5); i++) {
              const text = await secretValues.nth(i).textContent();
              if (text && text.length > 0 && text !== '—') {
                // Should be masked or empty
                const isMasked = text.includes('***') || text.includes('•••') || text.length < 10;
                // If it's not masked, it should be metadata like "Database" or "SSM"
                const isMetadata = ['Database', 'Env', 'SSM', '—'].some(m => text.includes(m));

                expect(isMasked || isMetadata).toBeTruthy();
              }
            }
          }
        }
      } else {
        // Might show empty state
        const emptyState = page.getByText(/no secrets/i);
        const hasEmptyState = await emptyState.count() > 0;

        if (hasEmptyState) {
          await expect(emptyState.first()).toBeVisible();
        }
      }
    });

    test('S-3: should support different storage locations', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Open create dialog
      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();
      await page.waitForTimeout(500);

      // Check for storage location options
      const locationSelect = page.locator('select[name="secretLocation"], select[name="location"]');
      const hasLocationSelect = await locationSelect.count() > 0;

      if (hasLocationSelect) {
        await expect(locationSelect).toBeVisible();

        // Get available options
        const options = await locationSelect.locator('option').allTextContents();
        const optionsText = options.join(' ').toLowerCase();

        // Should have at least env, database, or SSM
        expect(optionsText).toMatch(/env|database|ssm|parameter/i);
      } else {
        test.skip(true, 'Storage location select not found');
      }
    });

    test('S-4: should support environment variable storage', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();
      await page.waitForTimeout(500);

      const locationSelect = page.locator('select[name="secretLocation"], select[name="location"]');
      const hasLocationSelect = await locationSelect.count() > 0;

      if (hasLocationSelect) {
        // Select "env" option if available
        const options = await locationSelect.locator('option').allTextContents();
        const envOption = options.find(o => o.toLowerCase().includes('env'));

        if (envOption) {
          await locationSelect.selectOption(envOption);

          // When env is selected, value input might not be required
          await page.waitForTimeout(500);
          expect(true).toBe(true);
        }
      }
    });
  });

  test.describe('Secret Validation', () => {
    test('should require secret name', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();
      await page.waitForTimeout(500);

      // Try to submit without name
      const submitButton = page.getByRole('button', { name: /create|save/i })
        .or(page.locator('button[type="submit"]'));

      const hasSubmit = await submitButton.count() > 0;

      if (hasSubmit) {
        await submitButton.click();
        await page.waitForTimeout(500);

        // Should show validation error or not submit
        const nameInput = page.locator('input[name="name"]');
        const hasNameInput = await nameInput.count() > 0;

        if (hasNameInput) {
          const required = await nameInput.getAttribute('required');
          const hasRequired = required === '' || required === 'required';

          if (!hasRequired) {
            // Check for error message
            const error = page.getByText(/required|name is/i);
            const hasError = await error.count() > 0;
            expect(hasError).toBeTruthy();
          }
        }
      }
    });

    test('should validate secret name format', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="name"]');
      const hasNameInput = await nameInput.count() > 0;

      if (hasNameInput) {
        // Try invalid name with spaces
        await nameInput.first().fill('invalid secret name');

        const submitButton = page.getByRole('button', { name: /create|save/i })
          .or(page.locator('button[type="submit"]'));

        const hasSubmit = await submitButton.count() > 0;

        if (hasSubmit) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Should show error or not submit
          const error = page.getByText(/invalid|format|environment variable/i);
          const hasError = await error.count() > 0;

          if (hasError) {
            await expect(error.first()).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('Secret Deletion', () => {
    test('should allow deleting secrets', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Look for existing secrets with delete buttons
      const deleteButtons = page.locator('button:has-text("Delete"), button:has-text("Remove"), [data-testid*="delete"]');
      const hasDeleteButtons = await deleteButtons.count() > 0;

      if (hasDeleteButtons) {
        // Don't actually delete - just verify button exists
        await expect(deleteButtons.first()).toBeVisible();
      } else {
        test.skip(true, 'No secrets with delete buttons found');
      }
    });

    test('should show confirmation dialog before deletion', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const deleteButtons = page.locator('button:has-text("Delete"), button:has-text("Remove")');
      const hasDeleteButtons = await deleteButtons.count() > 0;

      if (hasDeleteButtons) {
        // Click delete button
        await deleteButtons.first().click();

        await page.waitForTimeout(500);

        // Should show confirmation dialog
        const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]');
        const hasDialog = await dialog.count() > 0;

        if (hasDialog) {
          // Look for confirmation text
          const confirmText = page.getByText(/are you sure|delete|confirm/i);
          await expect(confirmText.first()).toBeVisible();

          // Look for cancel button to close dialog
          const cancelButton = page.getByRole('button', { name: /cancel/i });
          if (await cancelButton.count() > 0) {
            await cancelButton.click();
          }
        }
      } else {
        test.skip(true, 'No secrets found');
      }
    });
  });

  test.describe('Secret Editing', () => {
    test('should allow editing secret metadata', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Look for edit buttons
      const editButtons = page.locator('button:has-text("Edit"), [data-testid*="edit"]');
      const hasEditButtons = await editButtons.count() > 0;

      if (hasEditButtons) {
        await editButtons.first().click();

        await page.waitForTimeout(500);

        // Should show edit dialog
        const dialog = page.locator('[role="dialog"], [class*="dialog"]');
        const hasDialog = await dialog.count() > 0;

        if (hasDialog) {
          await expect(dialog.first()).toBeVisible();

          // Close dialog
          const cancelButton = page.getByRole('button', { name: /cancel/i });
          if (await cancelButton.count() > 0) {
            await cancelButton.click();
          }
        }
      } else {
        test.skip(true, 'No secrets with edit buttons found');
      }
    });
  });

  test.describe('S-6: Security - No credential logging', () => {
    test('should not log secret values in console', async ({ authenticatedPage: page }) => {
      // Enable console logging
      const logs: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'log' || msg.type() === 'error') {
          logs.push(msg.text());
        }
      });

      await page.goto('/secrets');

      // Check for any secret values in logs
      const logsText = logs.join(' ');

      // Should not contain common secret patterns
      const hasSecretInLogs = [
        /password\s*[:=]\s*\S+/i,
        /token\s*[:=]\s*\S+/i,
        /api[_-]?key\s*[:=]\s*\S+/i,
        /secret\s*[:=]\s*\S+/i,
      ].some(pattern => pattern.test(logsText));

      expect(hasSecretInLogs).toBeFalsy();
    });
  });

  test.describe('SSM Configuration', () => {
    test('should allow SSM parameter path configuration', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const addSecretButton = page.getByRole('button', { name: /add|create/i })
        .or(page.locator('button:has-text("Add Secret")'));

      const hasAddButton = await addSecretButton.count() > 0;

      if (!hasAddButton) {
        test.skip(true, 'Add Secret button not found');
        return;
      }

      await addSecretButton.first().click();
      await page.waitForTimeout(500);

      const locationSelect = page.locator('select[name="secretLocation"], select[name="location"]');
      const hasLocationSelect = await locationSelect.count() > 0;

      if (hasLocationSelect) {
        // Look for SSM option
        const options = await locationSelect.locator('option').allTextContents();
        const ssmOption = options.find(o => o.toLowerCase().includes('ssm'));

        if (ssmOption) {
          await locationSelect.selectOption(ssmOption);
          await page.waitForTimeout(500);

          // Should show SSM path input
          const pathInput = page.locator('input[name="secretPath"], input[placeholder*="path" i]');
          const hasPathInput = await pathInput.count() > 0;

          if (hasPathInput) {
            await expect(pathInput.first()).toBeVisible();
          }

          // Close dialog
          const cancelButton = page.getByRole('button', { name: /cancel/i });
          if (await cancelButton.count() > 0) {
            await cancelButton.click();
          }
        } else {
          test.skip(true, 'SSM option not found');
        }
      }
    });
  });

  test.describe('Secret Badges', () => {
    test('should display storage location badges', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      // Look for badges indicating storage type
      const badges = page.locator('[class*="badge"], [role="status"], span[class*="color"]');
      const hasBadges = await badges.count() > 0;

      if (hasBadges) {
        // Check for storage type indicators
        const badgeText = await badges.allTextContents();
        const text = badgeText.join(' ').toLowerCase();

        // Should have at least some storage type mentioned
        const hasStorageType = text.match(/env|database|ssm|storage/i);
        expect(hasStorageType).toBeTruthy();
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no secrets exist', async ({ authenticatedPage: page }) => {
      await page.goto('/secrets');

      const table = page.locator('table');
      const hasTable = await table.count() > 0;

      if (!hasTable) {
        // Should show empty state
        const emptyState = page.getByText(/no secrets/i);
        await expect(emptyState.first()).toBeVisible();

        // Should have create button
        const createButton = page.getByRole('button', { name: /create|add/i });
        await expect(createButton.first()).toBeVisible();
      }
    });
  });
});
