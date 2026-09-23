import { researchDocument, runStatus, createTask, startResearch } from "../../playwright/tasks";
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
    await page.goto(`/project/${workspace.projectSlug}/jobs/${jobId}`);
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
