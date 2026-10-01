import { selectText } from "../../playwright/documentSelection";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, planDocument, researchDocument } from "../../playwright/tasks";

test("people and the agent work on a task in its thread: research, a comment and a revision, then the plan", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(240_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Thread" });

  // @agent, picked after typing @, asks the agent; it reads the thread and writes the research.
  const composer = thread.getByRole("textbox", { name: "Write a message" });
  await composer.fill("@");
  await thread.getByRole("option", { name: /Fake Agent/ }).click();
  await composer.fill(`${await composer.inputValue()}please write up what you find in RESEARCH.md`);
  await thread.getByRole("button", { name: "Post" }).click();
  await expect(thread.getByText("Research v1")).toBeVisible({ timeout: 120_000 });
  const firstTurn = thread.getByRole("listitem", { name: "Fake Agent's turn" }).first();
  await expect(firstTurn).toContainText("Writing the research");
  await expect(firstTurn).toContainText("started a fresh session");
  expect(await researchDocument(adminApi, task.id)).toContain("Explain how greeting.js works.");

  // A person comments on the research.
  await thread.getByRole("button", { name: "Open Research v1" }).click();
  await selectText(page, "Written", "tests");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const comment = page.getByRole("dialog", { name: "New comment" });
  await comment.getByRole("textbox", { name: "Comment" }).fill("Mention the farewell function too.");
  await comment.getByRole("button", { name: "Add comment" }).click();

  // Revising with it is one press; the agent continues its session and gets only what's new.
  await thread.getByRole("button", { name: "Revise the research with 1 comment" }).click();
  await expect(thread.getByText("Research v2")).toBeVisible({ timeout: 120_000 });
  const revised = await researchDocument(adminApi, task.id);
  expect(revised).toContain("Mention the farewell function too.");
  expect(revised).toContain("This is turn 2 of its session");
  expect(revised).not.toContain("Explain how greeting.js works.");
  await expect(thread.getByRole("listitem", { name: "Fake Agent's turn" }).nth(1)).toContainText("continued its session");
  // The comment went to the agent with that ask, so it isn't offered again.
  await expect(thread.getByRole("button", { name: "Revise the research with 1 comment" })).toHaveCount(0);

  // Then the plan.
  await thread.getByRole("button", { name: "Write the plan" }).click();
  await expect(thread.getByText("Plan v1")).toBeVisible({ timeout: 120_000 });
  const plan = await planDocument(adminApi, task.id);
  expect(plan).toContain("# Fake Plan");
  expect(plan).toContain("This is turn 3 of its session");
  // The plan didn't overwrite the research: each document keeps its own versions.
  expect(await researchDocument(adminApi, task.id)).toBe(revised);
});
