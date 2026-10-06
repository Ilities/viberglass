import type { Page } from "@playwright/test";
import { createTask, runStatus, startPlan, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

/**
 * Opens a run's link, which lands on its task with the run's details open over it, then closes them;
 * retries loads aborted by a container start (ERR_NETWORK_CHANGED).
 */
async function openRun(page: Page, projectSlug: string, jobId: string, taskTitle: string) {
  await expect(async () => {
    await page.goto(`/spaces/${projectSlug}/runs/${jobId}`);
    await expect(page.getByRole("dialog").getByText("Run details")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Close run details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
}

test("a task says whose move it is under its title and makes the move: the plan, then the build", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  // Each turn sleeps, so the running state can be seen.
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [fake:sleep=20]");
  const planningJobId = await startPlan(adminApi, task.id, workspace.clankerId);

  // While it runs, the agent has the move and it can be cancelled.
  await openRun(page, workspace.projectSlug, planningJobId, task.title);
  await expect(page.getByLabel("Situation")).toContainText("Agent writing the plan", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Plan/ })).toContainText("Agent working");

  // Once the plan is written, it's the person's move: read it, then ask for the build.
  await expect.poll(() => runStatus(adminApi, planningJobId), { timeout: 90_000 }).toBe("completed");
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
  await openRun(page, workspace.projectSlug, planningJobId, task.title);
  await expect(page.getByLabel("Situation")).toContainText("Your move · Plan v1 ready");
  // The document the run wrote is on the Plan tab.
  await page.getByRole("tab", { name: /^Plan/ }).click();
  await expect(page.getByText("Written by the fake agent used in end-to-end tests.").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Plan/ })).toContainText("Ready");

  // The build pushes code, so it starts only when someone asks the agent for it; nothing has to be approved first.
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Conversation" }).getByRole("button", { name: "Build it" })).toBeVisible();
});
