import { request, type APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { signIn } from "../../playwright/seedWorkspace";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask } from "../../playwright/tasks";

async function createSpace(adminApi: APIRequestContext, name: string, isPrivate: boolean) {
  const created = await adminApi.post("/api/spaces", { data: { name } });
  expect(created.status()).toBe(201);
  const space = (await created.json()).data;
  if (isPrivate) {
    expect((await adminApi.put(`/api/spaces/${space.id}`, { data: { isPrivate: true } })).status()).toBe(200);
  }
  return { id: String(space.id), slug: String(space.slug) };
}

async function spaceNames(api: APIRequestContext): Promise<string[]> {
  const body = await (await api.get("/api/spaces")).json();
  return body.data.map((space: { name: string }) => space.name);
}

async function userIdOf(adminApi: APIRequestContext, email: string): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === email).id;
}

test("a private space and its tasks stay hidden from people who aren't in it, until they're added", async ({
  adminApi,
  memberApi,
}) => {
  const space = await createSpace(adminApi, "Payments Private", true);
  const task = await createTask(adminApi, space.id, "A private task");

  expect(await spaceNames(memberApi)).not.toContain("Payments Private");
  expect((await memberApi.get(`/api/spaces/${space.id}`)).status()).toBe(404);
  expect((await memberApi.get(`/api/tasks/${task.id}`)).status()).toBe(404);
  const tasks = await (await memberApi.get("/api/tasks?limit=200")).json();
  expect(tasks.data.map((entry: { id: string }) => entry.id)).not.toContain(task.id);

  const memberId = await userIdOf(adminApi, E2E.member.email);
  expect((await adminApi.put(`/api/spaces/${space.id}/members/${memberId}`, { data: { role: "member" } })).status()).toBe(200);

  expect(await spaceNames(memberApi)).toContain("Payments Private");
  expect((await memberApi.get(`/api/tasks/${task.id}`)).status()).toBe(200);
});

test("only a space's maintainers change its settings", async ({ adminApi, memberApi }) => {
  const space = await createSpace(adminApi, "Maintained Space", false);

  expect((await memberApi.put(`/api/spaces/${space.id}`, { data: { isPrivate: true } })).status()).toBe(403);

  const memberId = await userIdOf(adminApi, E2E.member.email);
  await adminApi.put(`/api/spaces/${space.id}/members/${memberId}`, { data: { role: "maintainer" } });
  expect((await memberApi.put(`/api/spaces/${space.id}`, { data: { autoFixEnabled: false } })).status()).toBe(200);
});

test("a guest invited to one space sees only that space, can't see plumbing and can't run agents", async ({
  adminApi,
  browser,
  workspace,
}) => {
  const space = await createSpace(adminApi, "Guest Space", true);
  const task = await createTask(adminApi, space.id, "Review this with the guest");

  const invite = await adminApi.post("/api/invites", {
    data: { email: "guest@example.com", role: "guest", spaceIds: [space.id] },
  });
  expect(invite.status()).toBe(201);
  const token = String((await invite.json()).path).replace("/invite/", "");
  const anonymous = await request.newContext({ baseURL: E2E.backendUrl });
  expect(
    (await anonymous.post(`/api/account-links/invites/${token}`, { data: { name: "Gia Guest", password: "guest-password" } })).status(),
  ).toBe(201);
  await anonymous.dispose();

  const guest = await signIn({ email: "guest@example.com", password: "guest-password" });
  expect(await spaceNames(guest.api)).toEqual(["Guest Space"]);
  expect((await guest.api.get(`/api/spaces/${workspace.projectId}`)).status()).toBe(404);
  expect((await guest.api.get("/api/clankers")).status()).toBe(403);
  // Guests may talk on the task, but not ask the agent (until S3's rule on who may ask for code).
  expect(
    (await guest.api.post(`/api/tasks/${task.id}/messages`, { data: { body: "", action: "research", agentId: workspace.clankerId } })).status(),
  ).toBe(403);

  const context = await browser.newContext({ storageState: await guest.api.storageState() });
  await context.addInitScript((sessionToken) => {
    if (window.location.protocol.startsWith("http")) window.localStorage.setItem("auth_token", sessionToken);
  }, guest.token);
  const page = await context.newPage();
  await page.goto(`/spaces/${space.slug}/tasks/${task.id}`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  await context.close();
  await guest.api.dispose();
});
