import type { Page } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { invite, userId } from "../../playwright/people";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { createTask, needsYou, runStatus, startResearch } from "../../playwright/tasks";

const mention = (name: string, id: string, text: string) => `@[${name}](user:${id}) ${text}`;

/** Replies in the task's thread from its page. */
async function reply(page: Page, slug: string, taskId: string, text: string) {
  await page.goto(`/spaces/${slug}/tasks/${taskId}`);
  await page.getByRole("textbox", { name: "Write a message" }).fill(text);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(text)).toBeVisible();
}

test("a member who is mentioned sees it on Home with what's unread; replying makes it stop needing them", async ({
  adminApi,
  memberApi,
  memberPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Pick the checkout button colour");
  const member = await userId(adminApi, E2E.member.email);
  expect((await adminApi.post(`/api/tasks/${task.id}/messages`, { data: { body: mention(E2E.member.name, member, "which colour?") } })).status()).toBe(201);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  const row = page.getByRole("region", { name: "Needs you" }).getByRole("link", { name: new RegExp(task.title) });
  await expect(row).toContainText(`Your move · Discussing · ${E2E.member.name}`);
  await expect(row).toContainText("E2E Admin: @E2E Member which colour?");
  await expect(row.getByLabel("1 unread")).toBeVisible();

  await row.click();
  await reply(page, workspace.projectSlug, task.id, "Green, to match the brand.");
  await expect.poll(() => needsYou(memberApi)).not.toContain(`${task.title}: Discussing`);

  // Back on Home it's one of their tasks, read, waiting on someone else.
  await page.goto("/");
  const yours = page.getByRole("region", { name: "Your tasks" }).getByRole("link", { name: new RegExp(task.title) });
  await expect(yours).toContainText("Discussing · E2E Admin");
  await expect(yours.getByLabel(/unread/)).toHaveCount(0);
});

test("a new task is its owner's move, and the agent's research is theirs to look at, not the person's who asked for it", async ({
  adminApi,
  memberApi,
  workspace,
}) => {
  const task = await createTask(memberApi, workspace.projectId, "Summarise the README");
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Not started`);

  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => needsYou(memberApi)).not.toContain(`${task.title}: Not started`);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");

  // With no reviewers, the agent mentions the owner with what it produced.
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Research v1 ready`);
  expect((await needsYou(adminApi)).filter((line) => line.startsWith(task.title))).toEqual([]);
});

test("a guest on a task sees what needs them on Home, and replying clears it", async ({ adminApi, browser, workspace }) => {
  const guest = await invite(adminApi, "guest", "Gail Guest", [workspace.projectId]);
  const task = await createTask(adminApi, workspace.projectId, "Check the delivery wording");
  expect((await adminApi.post(`/api/tasks/${task.id}/messages`, { data: { body: mention("Gail Guest", guest.id, "does this read right?") } })).status()).toBe(201);

  const { context, page } = await signedInPage(browser, guest.session);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Needs you" }).getByRole("link", { name: new RegExp(task.title) })).toContainText(
    "Your move · Discussing · Gail Guest",
  );
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
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "In progress" }).getByText(task.title)).toBeVisible();
  await expect(page.getByRole("region", { name: "In progress" })).toContainText("Not started · E2E Admin");
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
  await context.close();
  await viewer.session.api.dispose();
});
