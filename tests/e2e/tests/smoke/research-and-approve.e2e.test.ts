import { createTask, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("asking the agent for the research writes a document that can be approved", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Thread" });
  await thread.getByRole("button", { name: "Write the research" }).click();

  // The ask is a message from the person; the agent's turn and the version it wrote follow it.
  await expect(thread.getByText("Write the research").first()).toBeVisible();
  await expect(async () => {
    // Reload: the container start can abort loads (ERR_NETWORK_CHANGED).
    await page.reload();
    await expect(thread.getByText("Research v1")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 120_000 });

  // The document the fake agent wrote (echoing its prompt) is on the task.
  await expect(page.getByRole("heading", { name: "Fake Research" })).toBeVisible();
  await expect(page.getByText("Explain how greeting.js works.").first()).toBeVisible();

  // Approval is the next move at the top of the task, and it also starts the plan.
  await page.getByRole("button", { name: "Approve & plan" }).click();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
});
