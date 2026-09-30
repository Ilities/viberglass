import { createTask, runStatus, startResearch } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("a phase can't be started twice while its run is in progress", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Look around first. [fake:sleep=20]");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // The backend refuses a second run and a live session for the same phase.
  const secondRun = await adminApi.post(`/api/tasks/${task.id}/phases/research/run`, {
    data: { clankerId: workspace.clankerId },
  });
  expect(secondRun.status()).toBe(409);
  expect((await secondRun.json()).message).toContain("research run is already in progress");
  const session = await adminApi.post(`/api/tasks/${task.id}/agent-sessions`, {
    data: { clankerId: workspace.clankerId, mode: "research", initialMessage: "Start research" },
  });
  expect(session.status()).toBe(409);

  // While it runs, the task offers no way to start it again, only to cancel. Retry the navigation:
  // a container start can abort loads with ERR_NETWORK_CHANGED.
  const working = page.getByRole("heading", { name: "The agent is working on the research" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(working).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start research" })).toHaveCount(0);

  // Without a reload, the page notices the run finish and asks for a review.
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");
  await expect(page.getByRole("button", { name: "Ask for changes" })).toBeEnabled({ timeout: 15_000 });
});
