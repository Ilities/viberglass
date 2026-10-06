import { request, type APIRequestContext, type Browser } from "@playwright/test";
import { selectText } from "../../playwright/documentSelection";
import { E2E } from "../../playwright/e2eEnvironment";
import { signIn } from "../../playwright/seedWorkspace";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { askAgent, createTask, needsYou, runStatus, startPlan, timeline } from "../../playwright/tasks";

/** Invites someone by link, has them accept it, and signs them in. */
async function invitePerson(adminApi: APIRequestContext, browser: Browser, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@example.com`;
  const password = `${name.replace(/\s+/g, "")}-password`;
  const invited = await adminApi.post("/api/invites", { data: { email, role: "member" } });
  expect(invited.status()).toBe(201);
  const token = String((await invited.json()).path).replace("/invite/", "");
  const anonymous = await request.newContext({ baseURL: E2E.backendUrl });
  expect((await anonymous.post(`/api/account-links/invites/${token}`, { data: { name, password } })).status()).toBe(201);
  await anonymous.dispose();
  const session = await signIn({ email, password });
  const { users } = await (await adminApi.get("/api/users")).json();
  const id: string = users.find((user: { email: string }) => user.email === email).id;
  const { page } = await signedInPage(browser, session);
  return { id, name, api: session.api, page };
}


async function runFinishes(api: APIRequestContext, jobId: string) {
  await expect.poll(() => runStatus(api, jobId), { timeout: 90_000 }).toBe("completed");
}

// Three people iterate on one task as a conversation, each step attributed and
// each person told what needs them. Nothing is approved; asking the agent to go
// on is the agreement.
test("a PM asks, a designer is mentioned and contributes, a reviewer comments on the rendered plan, has it revised and asks for the build", async ({
  adminApi,
  browser,
  workspace,
}) => {
  test.setTimeout(300_000);
  const designer = await invitePerson(adminApi, browser, "Dana Designer");
  const reviewer = await invitePerson(adminApi, browser, "Tomi Reviewer");

  // 1. The PM (the workspace admin) asks for something, and the agent plans it.
  const task = await createTask(adminApi, workspace.projectId, "Make the checkout copy friendlier on mobile.");
  await runFinishes(adminApi, await startPlan(adminApi, task.id, workspace.clankerId));

  // 3. The PM brings the designer in with an @mention; the designer answers in the thread.
  const posted = await adminApi.post(`/api/tasks/${task.id}/messages`, {
    data: { body: `@[${designer.name}](user:${designer.id}) which tone fits our brand here?` },
  });
  expect(posted.status()).toBe(201);
  await expect.poll(() => needsYou(designer.api)).toContain(`${task.title}: Discussing`);
  await designer.page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await designer.page.getByRole("textbox", { name: "Write a message" }).fill("Warm and short. No exclamation marks.");
  await designer.page.getByRole("button", { name: "Post" }).click();
  await expect(designer.page.getByText("Warm and short. No exclamation marks.")).toBeVisible();
  // Replying answers the mention, so it's no longer the designer's move.
  await expect.poll(() => needsYou(designer.api)).not.toContain(`${task.title}: Discussing`);

  // The PM adds the reviewer and asks for the plan with the designer's point; the agent mentions the reviewer when it's revised.
  expect((await adminApi.post(`/api/tasks/${task.id}/participants`, { data: { userId: reviewer.id, role: "reviewer" } })).status()).toBe(201);
  await runFinishes(adminApi, (await askAgent(adminApi, task.id, { action: "plan", body: "Revise the plan with Dana's tone" })).jobId);
  await expect.poll(() => needsYou(reviewer.api)).toContain(`${task.title}: Plan v2 ready`);

  // 4. The reviewer comments on the rendered plan and asks the agent to revise it with the comment.
  const page = reviewer.page;
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}?step=planning`);
    await expect(page.getByRole("heading", { name: "Fake Plan" })).toBeVisible();
  }).toPass();
  await selectText(page, "Written by", "tests.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByRole("dialog", { name: "New comment" }).getByRole("textbox", { name: "Comment" }).fill("Say who writes the copy.");
  await page.getByRole("dialog", { name: "New comment" }).getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator("mark").first()).toBeVisible();

  await page.getByRole("region", { name: "Thread" }).getByRole("button", { name: "Revise the plan with 1 comment" }).click();
  await expect.poll(async () => {
    const plan = (await (await adminApi.get(`/api/tasks/${task.id}/phases/planning`)).json()).data.document.content;
    return plan.includes("Say who writes the copy.");
  }, { timeout: 90_000 }).toBe(true);

  // 7. The reviewer is happy with it and asks the agent to build it: that ask is the agreement, under their name.
  await expect(async () => {
    await page.reload();
    await page.getByRole("region", { name: "Thread" }).getByRole("button", { name: "Build it" }).click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  let buildJobId = "";
  await expect.poll(async () => {
    const build = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "agent_turn" && entry.action === "code");
    buildJobId = typeof build?.jobId === "string" ? build.jobId : "";
    return buildJobId;
  }).not.toBe("");
  await runFinishes(adminApi, buildJobId);

  // Every step is attributed in the task's thread.
  const thread = page.getByRole("region", { name: "Thread" });
  await expect(thread.getByText("Warm and short. No exclamation marks.")).toBeVisible();
  for (const sentence of [
    "E2E Admin created the task",
    `E2E Admin asked ${reviewer.name} to review`,
    `Asked ${reviewer.name} to take a look`,
    `${reviewer.name} commented on the plan: “Written by the fake agent used in end-to-end tests.”`,
    "Revise the plan with 1 comment",
    "Build it",
  ]) {
    await expect(thread.getByText(sentence, { exact: true }).first()).toBeVisible();
  }
});
