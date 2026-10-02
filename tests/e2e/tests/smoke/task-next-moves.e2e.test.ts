import type { Page } from "@playwright/test";
import { createTask, runStatus, startResearch, taskPhase, timeline } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

/** Opens a run's link, which lands on its task; retries loads aborted by a container start (ERR_NETWORK_CHANGED). */
async function openRun(page: Page, projectSlug: string, jobId: string, taskTitle: string) {
  await expect(async () => {
    await page.goto(`/spaces/${projectSlug}/runs/${jobId}`);
    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

test("a task says whose move it is under its title and makes the move: research, then plan, then the build", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  // Each turn sleeps, so the running state can be seen.
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [fake:sleep=6]");
  const researchJobId = await startResearch(adminApi, task.id, workspace.clankerId);

  // While it runs, the agent has the move and it can be cancelled.
  await openRun(page, workspace.projectSlug, researchJobId, task.title);
  await expect(page.getByLabel("Situation")).toContainText("Agent writing the research", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Research/ })).toContainText("Agent working");

  // Once the research is written, it's the person's move: read it, then ask for the plan.
  await expect.poll(() => runStatus(adminApi, researchJobId), { timeout: 90_000 }).toBe("completed");
  await openRun(page, workspace.projectSlug, researchJobId, task.title);
  await expect(page.getByLabel("Situation")).toContainText("Your move · Research v1 ready");
  // A run's link opens its runs; the document it wrote is on the Document tab.
  await page.getByRole("button", { name: "Document" }).click();
  await expect(page.getByText("Written by the fake agent used in end-to-end tests.").first()).toBeVisible();
  await page.getByRole("region", { name: "Thread" }).getByRole("button", { name: "Write the plan" }).click();

  // Asking for the plan starts its run; the task's phase follows once the plan is written.
  let planningJobId = "";
  await expect.poll(async () => {
    const turn = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "agent_turn" && entry.action === "plan");
    planningJobId = typeof turn?.jobId === "string" ? turn.jobId : "";
    return planningJobId;
  }).not.toBe("");
  await expect.poll(() => runStatus(adminApi, planningJobId), { timeout: 90_000 }).toBe("completed");
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("planning");
  await openRun(page, workspace.projectSlug, planningJobId, task.title);
  await expect(page.getByLabel("Situation")).toContainText("Your move · Plan v1 ready");
  await expect(page.getByRole("tab", { name: /^Research/ })).toContainText("Written");

  // The build pushes code, so it starts only when someone asks the agent for it; nothing has to be approved first.
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Thread" }).getByRole("button", { name: "Build it" })).toBeVisible();
});
