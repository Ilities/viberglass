import type { APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, runStatus, startResearch } from "../../playwright/tasks";

async function inboxTexts(api: APIRequestContext): Promise<string[]> {
  const body = await (await api.get("/api/inbox")).json();
  return body.data.items.map((item: { text: string }) => item.text);
}

async function memberId(adminApi: APIRequestContext): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === E2E.member.email).id;
}

test("a review request lands in the reviewer's Inbox, and marking it done clears it", async ({
  adminApi,
  memberPage,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Review the checkout copy");
  const reviewer = await memberId(adminApi);
  expect(
    (await adminApi.post(`/api/tasks/${task.id}/participants`, { data: { userId: reviewer, role: "reviewer" } })).status(),
  ).toBe(201);

  const text = `E2E Admin asked you to review “${task.title}”`;
  await memberPage.goto("/inbox");
  const reviews = memberPage.getByRole("region", { name: "Review requests" });
  await expect(reviews.getByText(text)).toBeVisible();
  await expect(memberPage.getByLabel(/unread/).first()).toBeVisible();

  const row = reviews.getByRole("listitem").filter({ hasText: text });
  await row.getByRole("button", { name: "Mark done" }).click();
  await expect(memberPage.getByText(text)).toHaveCount(0);

  await memberPage.goto("/inbox?view=done");
  await expect(memberPage.getByText(text)).toBeVisible();
});

test("a finished run mentions the task's owner, but not the person who started it", async ({
  adminApi,
  memberApi,
  workspace,
}) => {
  const task = await createTask(memberApi, workspace.projectId, "Summarise the README");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 60_000 }).toBe("completed");

  // With no reviewers on the task, the agent mentions its owner with what it produced.
  const mention = `The agent mentioned you on “${task.title}”: the research is ready`;
  await expect.poll(() => inboxTexts(memberApi)).toContain(mention);
  expect((await inboxTexts(adminApi)).filter((text) => text.includes(task.title))).toEqual([]);
});

test("My tasks groups the tasks someone owns by whose move it is", async ({ memberApi, memberPage, workspace }) => {
  const task = await createTask(memberApi, workspace.projectId, "Owned and waiting on me");

  await memberPage.goto("/inbox?view=tasks");
  const waiting = memberPage.getByRole("region", { name: "Waiting on you" });
  await expect(waiting.getByRole("link", { name: new RegExp(task.title) })).toBeVisible();
});
