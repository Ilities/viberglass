import { createTask, runStatus, shownRunId, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("an automatic research run writes a document that can be approved", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await page.getByRole("button", { name: "Start research" }).click();
  const dialog = page.getByRole("dialog", { name: "Start Research" });
  await dialog.getByRole("button", { name: "Run automatically" }).click();

  // Starting a run opens it on the task.
  await expect(page).toHaveURL(/run=job_/);
  const jobId = shownRunId(page.url());
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");

  // Reload: the container start can abort the first load (ERR_NETWORK_CHANGED).
  await page.reload();

  // A run's link opens its runs; the document the fake agent wrote (echoing its prompt) is one tab over.
  await page.getByRole("button", { name: "Document" }).click();
  await expect(page.getByRole("heading", { name: "Fake Research" })).toBeVisible();
  await expect(page.getByText("Explain how greeting.js works.").first()).toBeVisible();

  // Approval is the next move at the top of the task, and it also starts the plan.
  await page.getByRole("button", { name: "Approve & plan" }).click();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
});
