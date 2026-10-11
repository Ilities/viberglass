import { selectText } from "../../playwright/documentSelection";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, planDocument } from "../../playwright/tasks";

test("people and the agent work on a task in its thread: the plan, a comment and a revision", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(240_000);
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });

  // @agent, picked after typing @, asks the agent; it reads the thread and writes the plan.
  const composer = thread.getByRole("combobox", { name: "Write a message" });
  await composer.fill("@");
  await thread.getByRole("option", { name: /Fake Agent/ }).click();
  await composer.fill(`${await composer.inputValue()}please write up what you find in PLAN.md`);
  await thread.getByRole("button", { name: "Post" }).click();
  await expect(thread.getByText("Plan v1")).toBeVisible({ timeout: 120_000 });
  const firstTurn = thread.getByRole("listitem", { name: "Fake Agent's turn" }).first();
  await expect(firstTurn).toContainText("Writing the plan");
  await expect(firstTurn).toContainText("fresh session");
  expect(await planDocument(adminApi, task.id)).toContain("Explain how greeting.js works.");

  // A person comments on the plan.
  await thread.getByRole("button", { name: "Open Plan v1" }).click();
  await selectText(page, "Written", "tests");
  await page.getByRole("button", { name: "Comment or suggest" }).click();
  const comment = page.getByRole("dialog", { name: "New comment" });
  await comment.getByRole("textbox", { name: "Comment" }).fill("Mention the farewell function too.");
  await comment.getByRole("button", { name: "Add comment" }).click();

  // Revising with it is one press; the agent continues its session and gets only what's new.
  await thread.getByRole("button", { name: "Revise the plan with 1 comment" }).click();
  await expect(thread.getByText("Plan v2")).toBeVisible({ timeout: 120_000 });
  const revised = await planDocument(adminApi, task.id);
  expect(revised).toContain("# Fake Plan");
  expect(revised).toContain("Mention the farewell function too.");
  expect(revised).toContain("This is turn 2 of its session");
  expect(revised).not.toContain("Explain how greeting.js works.");
  await expect(thread.getByRole("listitem", { name: "Fake Agent's turn" }).nth(1)).toContainText("resumed session");
  // The comment went to the agent with that ask, so it isn't offered again.
  await expect(thread.getByRole("button", { name: "Revise the plan with 1 comment" })).toHaveCount(0);
});
