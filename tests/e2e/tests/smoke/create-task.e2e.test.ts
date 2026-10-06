import { taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("creating a task through the form lands on it, in the plan step, with the plan as its first move", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/new`);
  await expect(page.getByRole("heading", { name: "Create New Task" })).toBeVisible();
  await expect(page.getByText("Every new task starts with a plan")).toBeVisible();

  const title = `Checkout button ${Date.now()}`;
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="description"]').fill("The checkout button does not respond.");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page).toHaveURL(new RegExp(`/spaces/${workspace.projectSlug}/tasks/[a-f0-9-]+$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const taskId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(await taskPhase(adminApi, taskId)).toBe("planning");
  await expect(page.getByRole("region", { name: "Conversation" }).getByRole("button", { name: "Write the plan" })).toBeVisible();
});
