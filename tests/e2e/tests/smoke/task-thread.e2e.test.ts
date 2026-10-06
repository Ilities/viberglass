import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, runStatus, startPlan } from "../../playwright/tasks";

test("a task's thread shows what was said, each document version and what happened, in order", async ({
  adminApi,
  memberApi,
  memberPage,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Pick the new button colour");
  const { users } = await (await adminApi.get("/api/users")).json();
  const member = users.find((user: { email: string }) => user.email === E2E.member.email);

  // A mention brings the member in as a watcher.
  const posted = await adminApi.post(`/api/tasks/${task.id}/messages`, {
    data: { body: `Which colour works here, @[${member.name}](user:${member.id})?` },
  });
  expect(posted.status()).toBe(201);
  const people = (await (await memberApi.get(`/api/tasks/${task.id}/participants`)).json()).data;
  expect(people).toContainEqual(expect.objectContaining({ userId: member.id, role: "watcher" }));

  // The admin asks the agent for the plan, which it writes; then the owner changes.
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("completed");
  expect((await adminApi.put(`/api/tasks/${task.id}/participants/owner`, { data: { userId: member.id } })).status()).toBe(200);

  // The member replies in the thread.
  await memberPage.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = memberPage.getByRole("region", { name: "Thread" });
  await expect(thread.getByText(`@${member.name}`)).toBeVisible();
  await thread.getByRole("textbox", { name: "Write a message" }).fill("The darker amber, it passes contrast.");
  await thread.getByRole("button", { name: "Post" }).click();
  await expect(thread.getByText("The darker amber, it passes contrast.")).toBeVisible();

  // Everything is in one thread, oldest first.
  const entries = thread.getByRole("listitem");
  const texts = await entries.allInnerTexts();
  const position = (needle: string) => texts.findIndex((text) => text.includes(needle));
  const order = [
    "E2E Admin created the task",
    "Which colour works here,",
    "Write the plan",
    "asked for the plan",
    "Plan v1",
    `E2E Admin made ${member.name} the owner`,
    "The darker amber, it passes contrast.",
  ].map(position);
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(thread.getByText("Written by the agent", { exact: false })).toBeVisible();

  // Messages only hides what happened and keeps what was said and written.
  await thread.getByRole("checkbox", { name: "Messages only" }).check();
  await expect(thread.getByText("E2E Admin created the task")).toHaveCount(0);
  await expect(thread.getByText("Plan v1")).toBeVisible();
  await expect(thread.getByText("The darker amber, it passes contrast.")).toBeVisible();
});
