import type { APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask } from "../../playwright/tasks";

async function createSpace(adminApi: APIRequestContext, name: string) {
  const created = await adminApi.post("/api/spaces", { data: { name } });
  expect(created.status()).toBe(201);
  const space = (await created.json()).data;
  return { id: String(space.id), slug: String(space.slug), keyPrefix: String(space.keyPrefix) };
}

async function participants(api: APIRequestContext, taskId: string) {
  const body = await (await api.get(`/api/tasks/${taskId}/participants`)).json();
  return body.data.map((entry: { name: string; role: string }) => `${entry.role}:${entry.name}`).sort();
}

test("tasks created at the same time get distinct keys, numbered in their space", async ({ adminApi }) => {
  const space = await createSpace(adminApi, "Keyed Space");
  expect(space.keyPrefix).toBe("KS");

  const created = await Promise.all(Array.from({ length: 8 }, (_, i) => createTask(adminApi, space.id, `Parallel task ${i}`)));
  const keys = await Promise.all(
    created.map(async (task) => (await (await adminApi.get(`/api/tasks/${task.id}`)).json()).data.key),
  );

  expect(new Set(keys).size).toBe(8);
  expect(keys.map((key: string) => Number(key.split("-")[1])).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a new task has its requester and owner, and the space's default owner wins when set", async ({
  adminApi,
  memberApi,
  workspace,
}) => {
  const byMember = await createTask(memberApi, workspace.projectId, "Asked for by the member");
  expect(await participants(memberApi, byMember.id)).toEqual(["owner:E2E Member", "requester:E2E Member"]);

  const space = await createSpace(adminApi, "Owned Space");
  const { users } = await (await adminApi.get("/api/users")).json();
  const admin = users.find((user: { email: string }) => user.email === E2E.admin.email);
  expect((await adminApi.put(`/api/spaces/${space.id}`, { data: { defaultOwnerId: admin.id } })).status()).toBe(200);

  const task = await createTask(memberApi, space.id, "Owned by the default owner");
  expect(await participants(memberApi, task.id)).toEqual(["owner:E2E Admin", "requester:E2E Member"]);
});

test("a task opens by its key, shows who's on it, and anyone can watch it", async ({ memberApi, memberPage, workspace }) => {
  const task = await createTask(memberApi, workspace.projectId, "Open me by key");
  const key = (await (await memberApi.get(`/api/tasks/${task.id}`)).json()).data.key;

  await memberPage.goto(`/spaces/${workspace.projectSlug}/tasks/${key}`);
  await expect(memberPage.getByRole("heading", { name: task.title })).toBeVisible();
  await expect(memberPage.getByText(new RegExp(`› ${key}$`))).toBeVisible();
  await memberPage.getByRole("button", { name: "Watch" }).click();
  await expect(memberPage.getByRole("button", { name: "Stop watching" })).toBeVisible();
  expect(await participants(memberApi, task.id)).toContain("watcher:E2E Member");
});
