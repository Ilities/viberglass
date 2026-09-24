import { E2E } from "../../playwright/e2eEnvironment";
import { FirstRunScenario } from "../../playwright/firstRunScenario";
import { SETUP_STUB, SetupStubServer } from "../../playwright/setupStubServer";
import { expect, test } from "../../playwright/smokeFixtures";

test("a product leader sets up an empty workspace alone and gets a first research result", async ({ page }) => {
  test.setTimeout(240_000);
  const stub = new SetupStubServer();
  await stub.start();
  const scenario = new FirstRunScenario(stub.url);
  try {
    await scenario.start();
    // The frontend talks to the suite's backend; send this page's API calls to the empty one instead.
    await page.route(`${E2E.backendUrl}/**`, (route) =>
      route.continue({ url: route.request().url().replace(E2E.backendUrl, scenario.backendUrl) }),
    );

    // The first account is the admin, and lands in setup.
    await page.goto("/register");
    await page.getByLabel("Email").fill("maria@example.com");
    await page.getByLabel("Full name").fill("Maria Product");
    await page.getByLabel("Password").fill("maria-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/setup$/);

    // 1. Model key: a wrong key is explained, the right one moves on.
    await expect(page.getByRole("heading", { name: "Connect an AI model" })).toBeVisible();
    await page.getByRole("combobox", { name: "Provider" }).click();
    await page.getByRole("option", { name: "Fake provider (tests)" }).click();
    await expect(page.getByText("agents run on Fake (end-to-end tests)")).toBeVisible();
    await page.getByLabel("API key").fill("wrong-key");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("rejected this key");
    await page.getByLabel("API key").fill(SETUP_STUB.modelKey);
    await page.getByRole("button", { name: "Continue" }).click();

    // 2. Repository: the token is checked with GitHub.
    await expect(page.getByRole("heading", { name: "Point at your repository" })).toBeVisible();
    await page.getByLabel("Repository").fill(SETUP_STUB.repository);
    await page.getByLabel("Access token").fill(SETUP_STUB.gitHubToken);
    await page.getByRole("button", { name: "Continue" }).click();

    // 3. Space: confirms what the token can do, with the name prefilled.
    await expect(page.getByRole("heading", { name: "Name your first space" })).toBeVisible();
    await expect(page.getByText(`Can read and push to ${SETUP_STUB.repository}`)).toBeVisible();
    await expect(page.getByLabel("Space name")).toHaveValue("fixture");
    await page.getByRole("button", { name: "Create space" }).click();

    // 4–5. The default agent starts on its own, then the first task is offered.
    await expect(page.getByRole("heading", { name: "Try your first task" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Start the task" }).click();
    await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/);

    // The research runs on the fake agent against the fixture repository, and its document appears on the task.
    const researchDocument = page.getByText("Written by the fake agent used in end-to-end tests.").first();
    await expect
      .poll(
        async () => {
          // Reload: the container start can abort a load (ERR_NETWORK_CHANGED). Then give the page time to fetch.
          await page.reload();
          return researchDocument.waitFor({ timeout: 5_000 }).then(
            () => true,
            () => false,
          );
        },
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBe(true);
  } finally {
    scenario.stop();
    await stub.stop();
  }
});
