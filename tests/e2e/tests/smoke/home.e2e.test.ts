import type { Page } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { invite, userId } from "../../playwright/people";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { createTask, needsYou, runStatus, startPlan } from "../../playwright/tasks";

const mention = (name: string, id: string, text: string) => `@[${name}](user:${id}) ${text}`;

/** Replies in the task's thread from its page. */
async function reply(page: Page, slug: string, taskId: string, text: string) {
  await page.goto(`/spaces/${slug}/tasks/${taskId}`);
  await page.getByRole("combobox", { name: "Write a message" }).fill(text);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(text)).toBeVisible();
}

test("a member who is mentioned sees it on Home with what was said; replying makes it stop needing them", async ({
  adminApi,
  memberApi,
  memberPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Pick the checkout button colour");
  const member = await userId(adminApi, E2E.member.email);
  expect((await adminApi.post(`/api/tasks/${task.id}/messages`, { data: { body: mention(E2E.member.name, member, "which colour?") } })).status()).toBe(201);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), E2E$/ })).toBeVisible();
  const row = page.getByRole("region", { name: /^Needs you/ }).getByRole("listitem", { name: task.title });
  await expect(row).toContainText("E2E mentioned you");
  await expect(row).toContainText("“@E2E Member which colour?”");

  await row.getByRole("link", { name: task.title }).click();
  await reply(page, workspace.projectSlug, task.id, "Green, to match the brand.");
  await expect.poll(() => needsYou(memberApi)).not.toContain(`${task.title}: Discussing`);

  // Back on Home it's one of their conversations, read, waiting on someone else.
  await page.goto("/");
  await expect(page.getByRole("region", { name: /^Needs you/ })).toHaveCount(0);
  const yours = page.getByRole("region", { name: "Your conversations" }).getByRole("listitem", { name: task.title });
  await expect(yours).toContainText("Discussing · E2E's turn");
  await expect(yours.getByLabel(/new message/)).toHaveCount(0);
});

test("a new task is its owner's move, and the agent's plan is theirs to look at, not the person's who asked for it", async ({
  adminApi,
  memberApi,
  workspace,
}) => {
  const task = await createTask(memberApi, workspace.projectId, "Summarise the README");
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Not started`);

  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => needsYou(memberApi)).not.toContain(`${task.title}: Not started`);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");

  // With no reviewers, the agent mentions the owner with what it produced.
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Plan v1 ready`);
  expect((await needsYou(adminApi)).filter((line) => line.startsWith(task.title))).toEqual([]);
});

test("a guest on a task sees what needs them on Home, and replying clears it", async ({ adminApi, browser, workspace }) => {
  const guest = await invite(adminApi, "guest", "Gail Guest", [workspace.projectId]);
  const task = await createTask(adminApi, workspace.projectId, "Check the delivery wording");
  expect((await adminApi.post(`/api/tasks/${task.id}/messages`, { data: { body: mention("Gail Guest", guest.id, "does this read right?") } })).status()).toBe(201);

  const { context, page } = await signedInPage(browser, guest.session);
  await page.goto("/");
  const row = page.getByRole("region", { name: /^Needs you/ }).getByRole("listitem", { name: task.title });
  await expect(row).toContainText("E2E mentioned you");
  await expect(row).toContainText("“@Gail Guest does this read right?”");
  // Guests don't start tasks.
  await expect(page.getByRole("link", { name: "Ask for something" })).toHaveCount(0);

  await reply(page, workspace.projectSlug, task.id, "Reads fine to me.");
  await expect.poll(() => needsYou(guest.session.api)).toEqual([]);
  await context.close();
  await guest.session.api.dispose();
});

test("a viewer lands on Overview and sees the work in progress, with whose move it is", async ({ adminApi, browser, workspace }) => {
  const viewer = await invite(adminApi, "viewer", "Vera Viewer");
  const task = await createTask(adminApi, workspace.projectId, "Tidy the footer links");

  const { context, page } = await signedInPage(browser, viewer.session);
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Work across the workspace" })).toBeVisible();
  const row = page.getByRole("region", { name: "Not started" }).getByRole("listitem", { name: task.title });
  await expect(row).toContainText("Not started · E2E's turn");
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
  await context.close();
  await viewer.session.api.dispose();
});
