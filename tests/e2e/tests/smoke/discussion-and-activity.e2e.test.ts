import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask } from "../../playwright/tasks";

test("a mention brings someone into the discussion, they reply, and Activity names who did what", async ({
  adminApi,
  memberApi,
  memberPage,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Pick the new button colour");
  const { users } = await (await adminApi.get("/api/users")).json();
  const member = users.find((user: { email: string }) => user.email === E2E.member.email);

  const posted = await adminApi.post(`/api/tasks/${task.id}/messages`, {
    data: { body: `Which colour works here, @[${member.name}](user:${member.id})?` },
  });
  expect(posted.status()).toBe(201);

  const people = (await (await memberApi.get(`/api/tasks/${task.id}/participants`)).json()).data;
  expect(people).toContainEqual(expect.objectContaining({ userId: member.id, role: "watcher" }));

  await memberPage.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await expect(memberPage.getByText("Which colour works here,")).toBeVisible();
  await expect(memberPage.getByText(`@${member.name}`)).toBeVisible();
  await memberPage.getByRole("textbox", { name: "Write a message" }).fill("The darker amber, it passes contrast.");
  await memberPage.getByRole("button", { name: "Post" }).click();
  await expect(memberPage.getByText("The darker amber, it passes contrast.")).toBeVisible();

  await memberPage.getByRole("button", { name: "Activity" }).click();
  await expect(memberPage.getByText("E2E Admin created the task")).toBeVisible();
  await expect(memberPage.getByText(`E2E Admin wrote in the discussion and mentioned ${member.name}`)).toBeVisible();
  await expect(memberPage.getByText(`${member.name} wrote in the discussion`, { exact: true })).toBeVisible();
});
