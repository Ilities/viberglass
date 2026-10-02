import { askAgent, researchDocument, runStatus, createTask, startResearch } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("cancelling a run stops the agent and keeps the run cancelled", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  // The fake agent sleeps long enough to be cancelled mid-run.
  const task = await createTask(adminApi, workspace.projectId, "Take your time. [fake:sleep=60]");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // Starting a container changes the host's network interfaces, and Chromium
  // aborts in-flight loads with ERR_NETWORK_CHANGED, so retry the navigation.
  const cancelButton = page.getByRole("button", { name: "Cancel run" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/runs/${jobId}`);
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await cancelButton.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop agent" }).click();

  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 15_000 }).toBe(false);

  // Nothing arrives late: the run stays cancelled and no document is written.
  await page.waitForTimeout(3_000);
  expect(await runStatus(adminApi, jobId)).toBe("cancelled");
  expect(await researchDocument(adminApi, task.id)).toBe("");
});

test("a run stopped partway keeps the research it had written, and says who stopped it", async ({ adminApi, adminPage: page, workspace }) => {
  test.setTimeout(120_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js.");
  // The fake agent writes the research, then keeps working.
  const run = await askAgent(adminApi, task.id, { action: "research", body: "Write the research. [fake:sleep-after=90]", agentId: workspace.clankerId });
  await expect.poll(() => isWorkerContainerRunning(run.jobId), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(8_000);

  const thread = page.getByRole("region", { name: "Thread" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(thread.getByRole("button", { name: "Cancel run" })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await thread.getByRole("button", { name: "Cancel run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop agent" }).click();

  await expect.poll(() => runStatus(adminApi, run.jobId)).toBe("cancelled");
  await expect.poll(() => researchDocument(adminApi, task.id), { timeout: 30_000 }).toContain("# Fake Research");
  await page.reload();
  await expect(thread.getByRole("listitem", { name: "Fake Agent's turn" })).toContainText("It kept the research it had written.");
  await expect(thread.getByRole("button", { name: "Open Research v1" })).toBeVisible();

  // The stopped container changes the host's network, which can abort a load; retry it.
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/runs/${run.jobId}`);
    await expect(page.getByText("E2E Admin cancelled it here")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
});
