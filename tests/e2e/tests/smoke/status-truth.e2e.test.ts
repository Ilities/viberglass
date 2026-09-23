import { createTask, runStatus, startResearch, taskStatus } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";
import type { Page } from "@playwright/test";

/** Opens the task page, retrying loads aborted by a container start (ERR_NETWORK_CHANGED). */
async function openTask(page: Page, projectSlug: string, taskId: string) {
  const researchHeader = page.getByRole("button", { name: /^1\s*Research/ });
  await expect(async () => {
    await page.goto(`/project/${projectSlug}/tickets/${taskId}`);
    await expect(researchHeader).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  return researchHeader;
}

test("status says an agent is working only while one runs, then asks for review", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Look around first. [fake:sleep=15]");

  const researchHeader = await openTask(page, workspace.projectSlug, task.id);
  await expect(researchHeader).toContainText("Not started");
  expect(await taskStatus(adminApi, task.id)).toBe("open");

  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  expect(await taskStatus(adminApi, task.id)).toBe("in_progress");
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);
  await openTask(page, workspace.projectSlug, task.id);
  await expect(researchHeader).toContainText("Agent working");
  await expect(page.getByText("Agent working").first()).toBeVisible();

  // Without a reload, both the phase and the task show that a human is needed.
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");
  await expect(researchHeader).toContainText("Awaiting review", { timeout: 15_000 });
  await expect.poll(() => taskStatus(adminApi, task.id)).toBe("in_review");
  await expect(page.getByText("Awaiting review").first()).toBeVisible();
});

test("a failed run shows as failed, and the task is no longer in progress", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "This will not work. [fake:fail]");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  const researchHeader = await openTask(page, workspace.projectSlug, task.id);
  await expect(researchHeader).toContainText("Failed");
  expect(await taskStatus(adminApi, task.id)).toBe("open");
});
