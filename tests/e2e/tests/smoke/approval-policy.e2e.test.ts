import type { APIRequestContext } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, taskPhase } from "../../playwright/tasks";

async function createSpace(adminApi: APIRequestContext, name: string) {
  const created = await adminApi.post("/api/spaces", { data: { name } });
  expect(created.status()).toBe(201);
  const space = (await created.json()).data;
  return { id: String(space.id), slug: String(space.slug) };
}

async function memberId(adminApi: APIRequestContext): Promise<string> {
  const { users } = await (await adminApi.get("/api/users")).json();
  return users.find((user: { email: string }) => user.email === E2E.member.email).id;
}

/** A task whose plan is written and up for review, without running an agent. */
async function taskWithPlan(adminApi: APIRequestContext, spaceId: string) {
  const task = await createTask(adminApi, spaceId, "Tidy the checkout copy");
  expect((await adminApi.post(`/api/tasks/${task.id}/phases/research/approve`)).status()).toBe(200);
  const saved = await adminApi.put(`/api/tasks/${task.id}/phases/planning/document`, {
    data: { content: "# Plan\n\n1. Shorten the button label." },
  });
  expect(saved.status()).toBe(200);
  return task;
}

test("only the plan's reviewers can approve it; anyone else asks, and the approval is credited", async ({
  adminApi,
  memberApi,
  memberPage: page,
}) => {
  const space = await createSpace(adminApi, "Approvals Journey");
  const task = await taskWithPlan(adminApi, space.id);

  // The member isn't on the task, so the plan doesn't wait on them.
  await page.goto(`/spaces/${space.slug}/tasks/${task.id}`);
  const banner = page.getByRole("region", { name: "Your move" });
  await expect(banner.getByText("The plan is ready for your review")).toBeVisible();
  await expect(banner.getByText("Waiting on E2E Admin to approve.", { exact: false })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Approve plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy task ID" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Skip to the build/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The server refuses too, saying who can approve.
  const refused = await memberApi.post(`/api/tasks/${task.id}/phases/planning/approve`);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain("Only E2E Admin, this space's maintainers or a workspace admin can approve the plan");
  expect((await memberApi.post(`/api/tasks/${task.id}/workflow/override-to-execution`, { data: { reason: "Urgent" } })).status()).toBe(403);

  // Asking themselves makes them a reviewer, which the plan then waits on.
  await banner.getByRole("combobox", { name: "Request approval from" }).click();
  await page.getByRole("option", { name: E2E.member.name }).click();
  await banner.getByRole("button", { name: "Ask to approve" }).click();
  await banner.getByRole("button", { name: "Approve plan" }).click();
  await expect.poll(() => taskPhase(adminApi, task.id)).toBe("execution");

  const plan = (await (await adminApi.get(`/api/tasks/${task.id}/phases/planning`)).json()).data.document;
  expect(plan.approvedBy).toBe(await memberId(adminApi));
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByText(`${E2E.member.name} approved the plan`)).toBeVisible();
});

test("a space's default reviewers review every new task's plan", async ({ adminApi, memberApi, adminPage: page }) => {
  const space = await createSpace(adminApi, "Default Reviewers Journey");
  const reviewer = await memberId(adminApi);

  await page.goto(`/spaces/${space.slug}/settings/members`);
  await page.getByRole("combobox", { name: "Add a default reviewer" }).click();
  await page.getByRole("option", { name: E2E.member.name }).click();
  await expect.poll(async () => (await (await adminApi.get(`/api/spaces/${space.id}`)).json()).data.defaultReviewerIds).toEqual([reviewer]);

  const task = await taskWithPlan(adminApi, space.id);
  const people = (await (await adminApi.get(`/api/tasks/${task.id}/participants`)).json()).data;
  expect(people).toContainEqual(expect.objectContaining({ userId: reviewer, role: "reviewer" }));

  const approvals = (await (await memberApi.get(`/api/tasks/${task.id}/approvals`)).json()).data;
  expect(approvals.planning).toEqual({ canApprove: true, approvers: [{ id: reviewer, name: E2E.member.name }] });
  expect((await memberApi.post(`/api/tasks/${task.id}/phases/planning/approve`)).status()).toBe(200);
});
