import type { Page } from "@playwright/test";
import { invite } from "../../playwright/people";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { createTask } from "../../playwright/tasks";

/** The task page's Actions menu, as the items this person is offered. */
async function taskActions(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Actions" }).click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return items.map((item) => item.trim());
}

/** What nobody but admins and members sees in a space: creating tasks, archiving, runs and schedules. */
async function expectNoRunnerActions(page: Page, slug: string) {
  await page.goto(`/spaces/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create task" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
  for (const label of ["Runs", "Schedules", "New space"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }

  // Space settings read as a summary, with no plumbing.
  await page.goto(`/spaces/${slug}/settings`);
  await expect(page.getByRole("heading", { name: "About this space" })).toBeVisible();
  for (const label of ["Connections", "Agent instructions"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }

  // Their pages aren't reachable by URL either.
  await page.goto(`/spaces/${slug}/runs`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${slug}$`));
}

test("a viewer sees no action they can't take: no composer, no task changes, nothing to create or run", async ({
  adminApi,
  browser,
  workspace,
}) => {
  const viewer = await invite(adminApi, "viewer", "Vince Viewer");
  const task = await createTask(adminApi, workspace.projectId, "Check the footer copy");
  const { context, page } = await signedInPage(browser, viewer.session);

  await expectNoRunnerActions(page, workspace.projectSlug);

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  await expect(thread.getByText(/created the task/)).toBeVisible();
  await expect(thread.getByRole("combobox", { name: "Write a message" })).toHaveCount(0);
  await expect(thread.getByRole("group", { name: "Suggested actions" })).toHaveCount(0);
  expect(await taskActions(page)).toEqual(["Copy link"]);

  await context.close();
  await viewer.session.api.dispose();
});

test("a guest on a task can talk in it, but sees no task changes and nothing to create or run", async ({
  adminApi,
  browser,
  workspace,
}) => {
  const guest = await invite(adminApi, "guest", "Gus Guest", [workspace.projectId]);
  const task = await createTask(adminApi, workspace.projectId, "Check the returns wording");
  const added = await adminApi.post(`/api/tasks/${task.id}/participants`, { data: { userId: guest.id, role: "watcher" } });
  expect(added.status()).toBeLessThan(300);
  const { context, page } = await signedInPage(browser, guest.session);

  await expectNoRunnerActions(page, workspace.projectSlug);

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  await expect(thread.getByRole("combobox", { name: "Write a message" })).toBeVisible();
  expect(await taskActions(page)).toEqual(["Copy link"]);

  await context.close();
  await guest.session.api.dispose();
});
