import type { Page } from "@playwright/test";
import { createTask, runStatus, shownRunId, startResearch, taskPhase } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

/** Opens a run's link, which lands on its task; retries loads aborted by a container start (ERR_NETWORK_CHANGED). */
async function openRun(page: Page, projectSlug: string, jobId: string, taskTitle: string) {
  await expect(async () => {
    await page.goto(`/spaces/${projectSlug}/runs/${jobId}`);
    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

test("a task says whose move it is at the top and makes the move: research, then plan, then the build", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  // Each turn sleeps, so the running state can be seen.
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [fake:sleep=6]");
  const researchJobId = await startResearch(adminApi, task.id, workspace.clankerId);

  // While it runs, the agent has the move and it can be cancelled.
  await openRun(page, workspace.projectSlug, researchJobId, task.title);
  await expect(page.getByRole("heading", { name: "The agent is working on the research" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Research/ })).toContainText("Agent working");

  // Once the research is written, it's the person's move: review, then approve.
  await expect.poll(() => runStatus(adminApi, researchJobId), { timeout: 90_000 }).toBe("completed");
  await openRun(page, workspace.projectSlug, researchJobId, task.title);
  await expect(page.getByRole("heading", { name: "The research is ready for your review" })).toBeVisible();
  // A run's link opens its runs; the document it wrote is on the Document tab.
  await page.getByRole("button", { name: "Document" }).click();
  await expect(page.getByText("Written by the fake agent used in end-to-end tests.").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve & plan" }).click();

  // Approving moves the task to the plan and opens the planning run it started.
  await expect(page).not.toHaveURL(new RegExp(researchJobId));
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
  await expect(page).toHaveURL(/run=job_/);
  const planningJobId = shownRunId(page.url());
  await expect(page.getByRole("tab", { name: /^Research/ })).toContainText("Approved");
  await expect(page.getByRole("button", { name: /Research run #1/ })).toBeVisible();

  await expect.poll(() => runStatus(adminApi, planningJobId), { timeout: 90_000 }).toBe("completed");
  await openRun(page, workspace.projectSlug, planningJobId, task.title);
  await expect(page.getByRole("heading", { name: "The plan is ready for your review" })).toBeVisible();
  await page.getByRole("button", { name: "Approve plan" }).click();

  // The build pushes code, so it starts only when asked, through the dialog that says where it goes.
  await expect(page.getByRole("heading", { name: "Start the build" })).toBeVisible();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("execution");
  await expect(page.getByRole("button", { name: "Start the build" })).toBeVisible();
});
