import type { APIRequestContext } from "@playwright/test";
import { selectText } from "../../playwright/documentSelection";
import { expect, test } from "../../playwright/smokeFixtures";
import { askAgent, createTask, runStatus } from "../../playwright/tasks";

const PLAN = "# Plan\n\n1. Shorten the **button label** on mobile.\n2. Keep the copy friendly.\n";

async function planComments(api: APIRequestContext, taskId: string) {
  return (await (await api.get(`/api/tasks/${taskId}/phases/planning/comments`)).json()).data;
}

async function savePlan(api: APIRequestContext, taskId: string, content: string) {
  expect((await api.put(`/api/tasks/${taskId}/phases/planning/document`, { data: { content } })).status()).toBe(200);
}

test("a reviewer comments on the rendered plan; the comment follows its text, and the agent gets it", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(180_000);
  const task = await createTask(adminApi, workspace.projectId, "Tidy the checkout copy");
  await savePlan(adminApi, task.id, PLAN);

  // The plan reads as rendered markdown, not source.
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}?step=planning`);
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  await expect(page.getByText("**button label**")).toHaveCount(0);

  // Select across the bold text, then comment on it.
  await selectText(page, "button", "mobile");
  await page.getByRole("button", { name: "Comment or suggest" }).click();
  const composer = page.getByRole("dialog", { name: "New comment" });
  await composer.getByRole("textbox", { name: "Comment" }).fill("Which button? Checkout or cart?");
  await composer.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator("mark").first()).toBeVisible();
  const [comment] = await planComments(adminApi, task.id);
  expect(comment.quote.exact).toBe("button label** on mobile");

  // Text added above it doesn't lose it; clicking the highlight shows what was said.
  await savePlan(adminApi, task.id, PLAN.replace("# Plan\n\n", "# Plan\n\nContext first.\n\n"));
  await page.reload();
  await page.locator("mark").first().click();
  await expect(page.getByRole("dialog", { name: "Comments on this text" }).getByText("Which button? Checkout or cart?")).toBeVisible();
  expect((await planComments(adminApi, task.id))[0]).toMatchObject({ outdated: false, lineNumber: 5 });

  // Asking for a revision sends the open comment, with the text it's on, to the agent (the fake agent echoes its prompt).
  const { jobId } = await askAgent(adminApi, task.id, { action: "plan", body: "Address the comment.", agentId: workspace.clankerId });
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");
  const plan = (await (await adminApi.get(`/api/tasks/${task.id}/phases/planning`)).json()).data.document.content;
  expect(plan).toContain("On “button label** on mobile”");
  expect(plan).toContain("Which button? Checkout or cart?");

  // Once the text it was on is gone, the comment is outdated, not lost.
  await savePlan(adminApi, task.id, "# Plan\n\n1. Rewrite the checkout copy.\n");
  expect((await planComments(adminApi, task.id))[0].outdated).toBe(true);
  await expect(async () => {
    await page.reload();
    await page.locator("summary", { hasText: /^Comments/ }).click();
    await expect(page.getByText("Outdated: the text changed")).toBeVisible();
  }).toPass();
});
