import { expect, test } from "../../playwright/smokeFixtures";
import { askAgent, createTask, planDocument, runStatus, timeline } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";

/** Opens the task once its worker is up; a new container can abort the page's loads, so this retries. */
async function openTask(page: import("@playwright/test").Page, url: string, ready: import("@playwright/test").Locator) {
  await expect(async () => {
    await page.goto(url);
    await expect(ready).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

test("the owner interrupts the agent with a new instruction, then pauses it and has it carry on", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(300_000);
  // Admins own the tasks they create, so they steer them.
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js.");
  const url = `/spaces/${workspace.projectSlug}/tasks/${task.id}`;
  const thread = page.getByRole("region", { name: "Conversation" });

  // A slow plan turn, interrupted with a new instruction: it stops, and the next turn has the instruction.
  const first = await askAgent(adminApi, task.id, { action: "plan", body: "Write the plan. [fake:sleep=15]", agentId: workspace.clankerId });
  await expect.poll(() => isWorkerContainerRunning(first.jobId), { timeout: 30_000 }).toBe(true);
  await openTask(page, url, thread.getByRole("button", { name: "Pause the agent" }));
  await thread.getByRole("combobox", { name: "Write a message" }).fill("Cover the farewell function too.");
  await thread.getByRole("button", { name: "Interrupt with this" }).click();

  await expect.poll(() => runStatus(adminApi, first.jobId)).toBe("cancelled");
  await expect(thread.getByText("Plan v1")).toBeVisible({ timeout: 120_000 });
  expect(await planDocument(adminApi, task.id)).toContain("Cover the farewell function too.");

  // Paused mid-revision: the run stops and asks wait; carrying on finishes the plan.
  const plan = await askAgent(adminApi, task.id, { action: "plan", body: "Revise the plan. [fake:sleep=15]" });
  await expect.poll(() => isWorkerContainerRunning(plan.jobId), { timeout: 30_000 }).toBe(true);
  await openTask(page, url, thread.getByRole("button", { name: "Pause the agent" }));
  await thread.getByRole("button", { name: "Pause the agent" }).click();
  const pausedCard = thread.getByRole("region", { name: "The agent is paused" });
  // Stopping the worker container takes a few seconds.
  await expect(pausedCard).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => runStatus(adminApi, plan.jobId)).toBe("cancelled");
  expect((await askAgent(adminApi, task.id, { body: "@agent mention the docs folder" }).catch((error: Error) => error.message))).toContain(
    "started no run",
  );

  await pausedCard.getByRole("button", { name: "Let it carry on" }).click();
  await expect(thread.getByText("Plan v2")).toBeVisible({ timeout: 120_000 });
  // The message sent while it was paused reached the agent with the plan.
  expect(await planDocument(adminApi, task.id)).toContain("mention the docs folder");
  const recorded = JSON.stringify(await timeline(adminApi, task.id));
  for (const kind of ["run_cancelled", "agent_paused", "agent_resumed"]) expect(recorded).toContain(`"kind":"${kind}"`);
});
