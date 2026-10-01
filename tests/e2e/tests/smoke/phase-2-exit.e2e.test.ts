import { request, type APIRequestContext, type Browser } from "@playwright/test";
import { selectText } from "../../playwright/documentSelection";
import { E2E } from "../../playwright/e2eEnvironment";
import { signIn } from "../../playwright/seedWorkspace";
import { expect, signedInPage, test } from "../../playwright/smokeFixtures";
import { createTask, runStatus, startResearch, taskPhase } from "../../playwright/tasks";

/** Invites someone by link, has them accept it, and signs them in (J3, J4). */
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

async function inbox(api: APIRequestContext): Promise<string[]> {
  return (await (await api.get("/api/inbox")).json()).data.items.map((item: { text: string }) => item.text);
}

async function runFinishes(api: APIRequestContext, jobId: string) {
  await expect.poll(() => runStatus(api, jobId), { timeout: 90_000 }).toBe("completed");
}

// Phase 2's exit (plan §12): J9 steps 1, 3, 4 and 7 with three people, each
// step attributed and each person told what needs them.
test("a PM asks, a designer is mentioned and contributes, a reviewer comments on the rendered plan, asks for changes and approves", async ({
  adminApi,
  browser,
  workspace,
}) => {
  test.setTimeout(300_000);
  const designer = await invitePerson(adminApi, browser, "Dana Designer");
  const reviewer = await invitePerson(adminApi, browser, "Tomi Reviewer");

  // 1. The PM (the workspace admin) asks for something, and the agent researches it.
  const task = await createTask(adminApi, workspace.projectId, "Make the checkout copy friendlier on mobile.");
  await runFinishes(adminApi, await startResearch(adminApi, task.id, workspace.clankerId));

  // 3. The PM brings the designer in with an @mention; the designer answers in the thread.
  const posted = await adminApi.post(`/api/tasks/${task.id}/messages`, {
    data: { body: `@[${designer.name}](user:${designer.id}) which tone fits our brand here?` },
  });
  expect(posted.status()).toBe(201);
  await expect.poll(() => inbox(designer.api)).toContain(`E2E Admin mentioned you on “${task.title}”`);
  await designer.page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await designer.page.getByRole("textbox", { name: "Write a message" }).fill("Warm and short. No exclamation marks.");
  await designer.page.getByRole("button", { name: "Post" }).click();
  await expect(designer.page.getByText("Warm and short. No exclamation marks.")).toBeVisible();

  // The PM approves the research; the agent writes the plan; the PM asks the reviewer to review it.
  expect((await adminApi.post(`/api/tasks/${task.id}/phases/research/approve`)).status()).toBe(200);
  const planning = await adminApi.post(`/api/tasks/${task.id}/phases/planning/run`, { data: { clankerId: workspace.clankerId } });
  await runFinishes(adminApi, (await planning.json()).data.jobId);
  expect((await adminApi.post(`/api/tasks/${task.id}/phases/planning/request-approval`, { data: { reviewerIds: [reviewer.id] } })).status()).toBe(200);
  await expect.poll(() => inbox(reviewer.api)).toContain(`E2E Admin asked you to review “${task.title}”`);
  // The designer isn't on the plan's review, so they can't approve it.
  expect((await designer.api.post(`/api/tasks/${task.id}/phases/planning/approve`)).status()).toBe(403);

  // 4. The reviewer comments on the rendered plan and asks for changes; the agent revises it.
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

  await page.getByRole("region", { name: "Your move" }).getByRole("button", { name: "Ask for changes" }).click();
  const revise = page.getByRole("dialog", { name: "Revise planning" });
  await revise.getByRole("textbox").fill("Cover the comment.");
  await revise.getByRole("button", { name: /Revise with/ }).click();
  await expect.poll(async () => {
    const plan = (await (await adminApi.get(`/api/tasks/${task.id}/phases/planning`)).json()).data.document.content;
    return plan.includes("Say who writes the copy.");
  }, { timeout: 90_000 }).toBe(true);

  // 7. The reviewer approves (warned that their comment is still open); the task moves on to the build.
  await expect(async () => {
    await page.reload();
    await page.getByRole("region", { name: "Your move" }).getByRole("button", { name: "Approve plan" }).click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Approve anyway" }).click();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("execution");

  // Every step is attributed in the task's thread.
  const thread = page.getByRole("region", { name: "Thread" });
  await expect(thread.getByText("Warm and short. No exclamation marks.")).toBeVisible();
  for (const sentence of [
    "E2E Admin created the task",
    "E2E Admin approved the research",
    `E2E Admin asked ${reviewer.name} to review`,
    `${reviewer.name} commented on the plan: “Written by the fake agent used in end-to-end tests.”`,
    `${reviewer.name} approved the plan`,
  ]) {
    await expect(thread.getByText(sentence, { exact: true }).first()).toBeVisible();
  }
});
