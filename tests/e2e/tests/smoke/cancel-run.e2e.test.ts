import { askAgent, planDocument, runStatus, createTask, startPlan } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("cancelling a run stops the agent and keeps the run cancelled", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  // The fake agent sleeps long enough to be cancelled mid-run.
  const task = await createTask(adminApi, workspace.projectId, "Take your time. [fake:sleep=60]");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // Starting a container changes the host's network interfaces, and Chromium
  // aborts in-flight loads with ERR_NETWORK_CHANGED, so retry the navigation.
  const cancelButton = page.getByRole("region", { name: "Conversation" }).getByRole("button", { name: "Cancel run" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await cancelButton.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop agent" }).click();

  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 15_000 }).toBe(false);

  // Nothing arrives late: the run stays cancelled and no document is written.
  await page.waitForTimeout(3_000);
  expect(await runStatus(adminApi, jobId)).toBe("cancelled");
  expect(await planDocument(adminApi, task.id)).toBe("");
});

test("a run stopped partway keeps the plan it had written, and says who stopped it", async ({ adminApi, adminPage: page, workspace }) => {
  test.setTimeout(120_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js.");
  // The fake agent writes the plan, then keeps working.
  const run = await askAgent(adminApi, task.id, { action: "plan", body: "Write the plan. [fake:sleep-after=90]", agentId: workspace.clankerId });
  await expect.poll(() => isWorkerContainerRunning(run.jobId), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(8_000);

  const thread = page.getByRole("region", { name: "Conversation" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(thread.getByRole("button", { name: "Cancel run" })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await thread.getByRole("button", { name: "Cancel run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop agent" }).click();

  await expect.poll(() => runStatus(adminApi, run.jobId)).toBe("cancelled");
  await expect.poll(() => planDocument(adminApi, task.id), { timeout: 30_000 }).toContain("# Fake Plan");
  await page.reload();
  await expect(thread.getByRole("listitem", { name: "Fake Agent's turn" })).toContainText("It kept the plan it had written.");
  await expect(thread.getByRole("button", { name: "Open Plan v1" })).toBeVisible();
  await expect(thread.getByText("E2E Admin cancelled a run")).toBeVisible();
});
