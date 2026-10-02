import { request, type APIRequestContext, type Page } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { signIn } from "../../playwright/seedWorkspace";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { createTask, needsYou, planDocument, runStatus, timeline } from "../../playwright/tasks";

async function memberId(adminApi: APIRequestContext): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === E2E.member.email).id;
}

/** Invites a guest to one space by link and signs them in. */
async function inviteGuest(adminApi: APIRequestContext, spaceId: string) {
  const email = `guest.${Date.now()}@example.com`;
  const invite = await adminApi.post("/api/invites", { data: { email, role: "guest", spaceIds: [spaceId] } });
  expect(invite.status()).toBe(201);
  const token = String((await invite.json()).path).replace("/invite/", "");
  const anonymous = await request.newContext({ baseURL: E2E.backendUrl });
  expect((await anonymous.post(`/api/account-links/invites/${token}`, { data: { name: "Gia Guest", password: "guest-password" } })).status()).toBe(201);
  await anonymous.dispose();
  const session = await signIn({ email, password: "guest-password" });
  const { users } = await (await adminApi.get("/api/users")).json();
  return { session, id: String(users.find((user: { email: string }) => user.email === email).id) };
}

const askToBuild = (api: APIRequestContext, taskId: string) =>
  api.post(`/api/tasks/${taskId}/messages`, { data: { body: "", action: "code" } });

test("only people on the task, maintainers and admins can ask the agent to build; a guest off the task can't ask at all", async ({
  adminApi,
  memberApi,
  memberPage,
  browser,
  workspace,
}) => {
  test.setTimeout(180_000);
  const task = await createTask(adminApi, workspace.projectId, "Shorten the greeting.");
  const guest = await inviteGuest(adminApi, workspace.projectId);

  // A member who isn't on the task may ask for research or a plan, but isn't offered the build, and the API refuses it.
  await memberPage.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const memberThread = memberPage.getByRole("region", { name: "Thread" });
  await expect(memberThread.getByRole("button", { name: "Write the research" })).toBeVisible();
  await expect(memberThread.getByRole("button", { name: "Build it" })).toHaveCount(0);
  const refused = await askToBuild(memberApi, task.id);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain("Only the task's people, this space's maintainers or a workspace admin can ask the agent to build");

  // A guest who isn't on the task is offered nothing, and can't ask for anything.
  const { context, page } = await signedInPage(browser, guest.session);
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Thread" });
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  await expect(thread.getByRole("button", { name: "Write the research" })).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "Build it" })).toHaveCount(0);
  expect((await askToBuild(guest.session.api, task.id)).status()).toBe(403);
  expect((await guest.session.api.post(`/api/tasks/${task.id}/messages`, { data: { body: "", action: "research" } })).status()).toBe(403);
  expect((await (await guest.session.api.get(`/api/tasks/${task.id}`)).json()).data.capabilities).toEqual({ canAsk: false, canAskForCode: false });

  // On the task, the guest may ask it to build, with nothing approved first; the build runs and is theirs.
  expect((await adminApi.post(`/api/tasks/${task.id}/participants`, { data: { userId: guest.id, role: "watcher" } })).status()).toBe(201);
  await page.reload();
  await thread.getByRole("button", { name: "Build it" }).click();
  await expect(thread.getByText("Build it").first()).toBeVisible();
  let jobId = "";
  await expect.poll(async () => {
    const turn = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "agent_turn" && entry.action === "code");
    jobId = typeof turn?.jobId === "string" ? turn.jobId : "";
    return jobId;
  }).not.toBe("");
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 120_000 }).toBe("completed");
  const asked = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "message" && entry.body === "Build it");
  expect(asked).toMatchObject({ author: { id: guest.id } });

  await context.close();
  await guest.session.api.dispose();
});

test("a space's default reviewers join each new task, and the agent mentions them when the plan is ready", async ({
  adminApi,
  memberApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(180_000);
  const reviewer = await memberId(adminApi);
  await page.goto(`/spaces/${workspace.projectSlug}/settings/members`);
  await page.getByRole("combobox", { name: "Add a default reviewer" }).click();
  await page.getByRole("option", { name: E2E.member.name }).click();
  await expect
    .poll(async () => (await (await adminApi.get(`/api/spaces/${workspace.projectId}`)).json()).data.defaultReviewerIds)
    .toEqual([reviewer]);

  try {
    await mentionsTheReviewer(adminApi, memberApi, page, workspace, reviewer);
  } finally {
    // Leave the seeded space as other journeys expect it.
    expect((await adminApi.put(`/api/spaces/${workspace.projectId}`, { data: { defaultReviewerIds: [] } })).status()).toBe(200);
  }
});

async function mentionsTheReviewer(
  adminApi: APIRequestContext,
  memberApi: APIRequestContext,
  page: Page,
  workspace: { projectId: string; projectSlug: string },
  reviewer: string,
) {
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js.");
  const people = (await (await adminApi.get(`/api/tasks/${task.id}/participants`)).json()).data;
  expect(people).toContainEqual(expect.objectContaining({ userId: reviewer, role: "reviewer" }));
  expect((await (await memberApi.get(`/api/tasks/${task.id}`)).json()).data.capabilities).toEqual({ canAsk: true, canAskForCode: true });

  // The plan arrives as the agent's post mentioning the reviewer, in place of a review request.
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await page.getByRole("region", { name: "Thread" }).getByRole("button", { name: "Write the plan" }).click();
  await expect.poll(() => planDocument(adminApi, task.id), { timeout: 120_000 }).toContain("Fake Plan");
  // The mention makes it the reviewer's move on Home, and stays so until they answer.
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Plan v1 ready`);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: "Thread" }).getByText(`Asked ${E2E.member.name} to take a look`)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}
