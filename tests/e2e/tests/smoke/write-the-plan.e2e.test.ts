import { createTask, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("asking the agent for the plan writes a document, with nothing to approve", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(240_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Thread" });
  await thread.getByRole("button", { name: "Write the plan" }).click();

  // The ask is a message from the person; the agent's turn and the version it wrote follow it.
  await expect(thread.getByText("Write the plan").first()).toBeVisible();
  await expect(async () => {
    // Reload: the container start can abort loads (ERR_NETWORK_CHANGED).
    await page.reload();
    await expect(thread.getByText("Plan v1")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 120_000 });

  // The document the fake agent wrote (echoing its prompt) is on the task, and it's ready: nothing to approve.
  await expect(page.getByRole("heading", { name: "Fake Plan" })).toBeVisible();
  await expect(page.getByText("Explain how greeting.js works.").first()).toBeVisible();
  await expect(page.getByLabel("Situation")).toContainText("Your move · Plan v1 ready");
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  expect(await taskPhase(adminApi, task.id)).toBe("planning");
});
