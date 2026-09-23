import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";

test("the seeded admin can sign in through the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(E2E.admin.email);
  await page.getByRole("textbox", { name: "Password" }).fill(E2E.admin.password);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText("E2E Space").first()).toBeVisible();
});
