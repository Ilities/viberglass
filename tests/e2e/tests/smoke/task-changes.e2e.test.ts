import { expect, test } from "../../playwright/smokeFixtures";
import { createTask } from "../../playwright/tasks";

test("only a task's requester and owner, maintainers and admins change it; only admins delete it", async ({
  adminApi,
  memberApi,
  workspace,
}) => {
  // The admin asked and owns it; the member can see it but isn't on it.
  const theirs = await createTask(adminApi, workspace.projectId, "Someone else's task");
  expect((await memberApi.put(`/api/tasks/${theirs.id}`, { data: { title: "Renamed" } })).status()).toBe(403);
  expect((await memberApi.post(`/api/tasks/${theirs.id}/set-status`, { data: { status: "resolved" } })).status()).toBe(403);
  expect((await memberApi.post("/api/tasks/archive", { data: { ticketIds: [theirs.id] } })).status()).toBe(403);
  const refused = await memberApi.delete(`/api/tasks/${theirs.id}`);
  expect(refused.status()).toBe(403);
  expect(JSON.stringify(await refused.json())).toContain("Only a workspace admin can delete a task");
  expect((await adminApi.get(`/api/tasks/${theirs.id}`)).status()).toBe(200);

  // Their own task they may edit and archive, but not delete.
  const own = await createTask(memberApi, workspace.projectId, "My own task");
  expect((await memberApi.put(`/api/tasks/${own.id}`, { data: { title: `${own.title} (edited)` } })).status()).toBe(200);
  expect((await memberApi.post("/api/tasks/archive", { data: { ticketIds: [own.id] } })).status()).toBe(200);
  expect((await memberApi.delete(`/api/tasks/${own.id}`)).status()).toBe(403);

  expect((await adminApi.delete(`/api/tasks/${own.id}`)).status()).toBe(200);
});
