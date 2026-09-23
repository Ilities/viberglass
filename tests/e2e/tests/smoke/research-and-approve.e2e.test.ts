import { createTask, runStatus, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("an automatic research run writes a document that can be approved", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");

  await page.goto(`/project/${workspace.projectSlug}/tickets/${task.id}`);
  await page.getByRole("button", { name: "Run Research" }).click();
  const dialog = page.getByRole("dialog", { name: "Start Research" });
  await dialog.getByRole("button", { name: "Run automatically" }).click();

  // Starting a run opens its run page.
  await expect(page).toHaveURL(/\/jobs\/job_/);
  const jobId = page.url().split("/jobs/")[1];
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");

  // Reload: the container start can abort the first load (ERR_NETWORK_CHANGED).
  await page.reload();
  await expect(page.getByText("Completed").first()).toBeVisible();
  await page.getByRole("link", { name: "View Research" }).first().click();

  // The fake agent echoes its prompt, which contains the task description.
  await expect(page.getByRole("heading", { name: "Fake Research" })).toBeVisible();
  await expect(page.getByText("Explain how greeting.js works.").first()).toBeVisible();

  await page.getByRole("button", { name: "Approve Research & Continue" }).click();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
});
