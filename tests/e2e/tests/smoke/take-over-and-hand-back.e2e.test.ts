import { pushToFixture } from "../../playwright/gitFixtureServer";
import { expect, test } from "../../playwright/smokeFixtures";
import { askAgent, createTask, needsYou, planDocument, runStatus } from "../../playwright/tasks";

test("the owner takes the work over, pushes a commit to the task's branch, hands it back, and the agent's next turn has the commit", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(240_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js.");
  const first = await askAgent(adminApi, task.id, { action: "plan", body: "Write the plan.", agentId: workspace.clankerId });
  await expect.poll(() => runStatus(adminApi, first.jobId), { timeout: 120_000 }).toBe("completed");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  await thread.getByRole("button", { name: "Take over" }).click();
  const card = thread.getByRole("region", { name: "Taken over" });
  await expect(card).toContainText("E2E Admin is working on it locally");
  // No build has pushed the branch yet, so it starts from the base branch.
  const branch = `viberglass/${task.id}`;
  await expect(card.getByLabel("Checkout commands")).toContainText(`git switch -c ${branch} origin/main`);
  await expect.poll(() => needsYou(adminApi)).toContain(`${task.title}: Taken over locally`);

  // What they'd do on their machine: commit on the task's branch and push it.
  pushToFixture(branch, "greeting.js", "export const greeting = () => 'hello there';\n", "Say hello politely");

  await card.getByRole("textbox", { name: "Note for the agent" }).fill("Update PLAN.md with my change to greeting.js.");
  await card.getByRole("button", { name: "Hand back" }).click();
  await expect(card).toHaveCount(0);

  // The next turn starts from the branch and is told what was pushed there since the agent's last commit.
  await expect(thread.getByText("Plan v2")).toBeVisible({ timeout: 120_000 });
  const plan = await planDocument(adminApi, task.id);
  expect(plan).toContain("&lt;pushed-by-people>");
  expect(plan).toMatch(/[0-9a-f]{7} Dev Local: Say hello politely/);
  expect(plan).toContain("greeting.js | 2 +-");
  expect(plan).toContain("Update PLAN.md with my change to greeting.js.");
});
