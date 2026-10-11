import { askAgent, createTask, planDocument, runStatus, sessionStatus, startPlan } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("asking the agent again while it works waits for its turn instead of starting another run", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(180_000);
  const task = await createTask(adminApi, workspace.projectId, "Look around first. [fake:sleep=20]");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // A second ask, and a live session opened on the task, join the turn that's running.
  const second = await askAgent(adminApi, task.id, { action: "plan", body: "Also note the farewell in PLAN.md", agentId: workspace.clankerId });
  expect(second).toMatchObject({ jobId, status: "queued" });
  const session = await adminApi.post(`/api/tasks/${task.id}/agent-sessions`, {
    data: { clankerId: workspace.clankerId, mode: "planning", initialMessage: "One more thing" },
  });
  expect(session.status()).toBe(202);
  expect((await session.json()).data.job).toEqual({ id: jobId, status: "queued" });

  // While it runs, the task offers no new asks, only to cancel. Retry the navigation:
  // a container start can abort loads with ERR_NETWORK_CHANGED.
  const working = page.getByLabel("Situation").getByText(/Agent writing the plan/);
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(working).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Suggested actions" })).toHaveCount(0);

  // When it ends, the next turn takes both messages at once; then it's the person's move again.
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");
  await expect.poll(() => planDocument(adminApi, task.id), { timeout: 120_000 }).toContain("One more thing");
  expect(await planDocument(adminApi, task.id)).toContain("Also note the farewell");
  await expect.poll(() => sessionStatus(adminApi, second.sessionId), { timeout: 30_000 }).toBe("waiting_on_user");
  await expect(page.getByLabel("Situation")).toContainText("Plan v", { timeout: 15_000 });
});
