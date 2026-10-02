import { expect, test } from "../../playwright/smokeFixtures";
import { createFakeRunner } from "../../playwright/seedWorkspace";
import { askAgent, createTask, researchDocument, runStatus, timeline } from "../../playwright/tasks";

type Entry = Record<string, unknown>;
const isEntry = (value: unknown): value is Entry => typeof value === "object" && value !== null && !Array.isArray(value);
const outcomeOf = (entry: Entry): Entry => (isEntry(entry.outcome) ? entry.outcome : {});

test("a full context is summarised on its own, and a second agent starts fresh from the summary", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(300_000);
  // The fake agent reports 150,000 of 200,000 tokens in its context, past the threshold.
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [fake:usage=150000]");
  const research = await askAgent(adminApi, task.id, { action: "research", body: "Write the research", agentId: workspace.clankerId });
  await expect.poll(() => runStatus(adminApi, research.jobId), { timeout: 120_000 }).toBe("completed");

  // The summary follows without anyone asking, and the harness compacts its context with it.
  let summary: Entry | undefined;
  await expect
    .poll(
      async () => {
        summary = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "summary");
        return summary?.version;
      },
      { timeout: 120_000 },
    )
    .toBe(1);
  expect(String(summary?.content)).toContain("# Fake Summary");
  const summarising = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "agent_turn" && entry.action === "summarise");
  expect(outcomeOf(summarising ?? {})).toMatchObject({ produced: ["summary"], compacted: true });

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const pinned = page.getByRole("region", { name: "Summary so far" });
  await expect(pinned).toContainText("Fake Summary");
  await expect(page.getByRole("listitem", { name: "Summary v1" })).toBeVisible();

  // A second agent starts cold: its first prompt carries the summary instead of the thread it covers.
  const second = await createFakeRunner(adminApi, "Stand-in Agent");
  try {
    await page.reload();
    await page.getByRole("button", { name: "Bring in another agent" }).press("Enter");
    await expect(page.getByRole("menuitem", { name: /Stand-in Agent/ })).toBeVisible();
    await page.keyboard.press("Escape");

    const before = await researchDocument(adminApi, task.id);
    const brought = await askAgent(adminApi, task.id, { action: "research", body: "Revise the research", agentId: second });
    await expect.poll(() => runStatus(adminApi, brought.jobId), { timeout: 120_000 }).toBe("completed");
    const written = await researchDocument(adminApi, task.id);
    expect(written).not.toBe(before);
    expect(written).toContain("&lt;summary-so-far>");
    expect(written).toContain("This is turn 1 of its session.");

    const turn = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "agent_turn" && entry.jobId === brought.jobId);
    expect(turn).toMatchObject({ agent: { id: second } });
    expect(outcomeOf(turn ?? {})).toMatchObject({ resumed: false });
  } finally {
    // Other journeys expect one agent; a stopped one isn't picked for a new task.
    await adminApi.post(`/api/clankers/${second}/stop`);
  }
});
