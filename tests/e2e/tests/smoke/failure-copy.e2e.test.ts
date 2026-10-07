import type { APIRequestContext, Page } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { createTask, planDocument, runStatus, startPlan } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

/**
 * Opens the task and returns the notice that explains its failed plan, retrying loads aborted
 * by a container start (ERR_NETWORK_CHANGED).
 */
async function openFailure(page: Page, projectSlug: string, taskId: string, title: string) {
  const notice = page.getByRole("region", { name: "Conversation" }).getByRole("region", { name: /^The plan failed/ });
  await expect(async () => {
    await page.goto(`/spaces/${projectSlug}/tasks/${taskId}`);
    await expect(notice).toContainText(title, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  return notice;
}

/** The task's newest run. */
async function latestRunId(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/jobs?ticketId=${taskId}&limit=1`)).json();
  return String(body?.jobs?.[0]?.jobId ?? body?.data?.jobs?.[0]?.jobId);
}

/** A space whose repository doesn't exist, so every run fails to clone it. */
async function createSpaceWithMissingRepository(api: APIRequestContext) {
  const integrations = await (await api.get("/api/integrations")).json();
  const list: Array<{ id: string; system: string }> = integrations?.data ?? integrations;
  const github = list.find((integration) => integration.system === "github");
  if (!github) throw new Error("The seeded GitHub integration is missing");

  const created = await (
    await api.post("/api/spaces", { data: { name: `Broken Space ${Date.now()}` } })
  ).json();
  const project = created?.data ?? created;
  await api.post(`/api/integrations/space/${project.id}/link`, {
    data: { integrationId: github.id, isPrimary: true },
  });
  const configured = await api.put(`/api/spaces/${project.id}/scm-config`, {
    data: {
      integrationId: github.id,
      sourceRepository: E2E.workerReachableRepositoryUrl.replace("fixture.git", "missing.git"),
      baseBranch: "main",
    },
  });
  if (!configured.ok()) throw new Error(`Configuring the repository failed: ${configured.status()}`);
  return { projectId: String(project.id), projectSlug: String(project.slug) };
}

test("an agent failure invites a retry instead of a setup fix", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "This will not work. [fake:fail]");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  const notice = await openFailure(page, workspace.projectSlug, task.id, "Agent failed");
  await expect(notice).toContainText("The agent stopped with an error before finishing.");
  // The task offers a retry, not a setup fix (the task page's readiness banner is separate).
  await expect(notice.getByRole("link", { name: /^(Fix|Check)/ })).toHaveCount(0);

  // Trying again is offered in the task's thread: it asks the agent again, in a new run.
  await page.getByRole("region", { name: "Conversation" }).getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => latestRunId(adminApi, task.id)).not.toBe(jobId);
  const retryJobId = await latestRunId(adminApi, task.id);
  await expect.poll(() => runStatus(adminApi, retryJobId), { timeout: 90_000 }).toBe("failed");

  // The Runs list says why, and so does the phase.
  await page.goto(`/spaces/${workspace.projectSlug}/runs`);
  await expect(page.getByRole("row", { name: /Agent failed/ }).first()).toBeVisible();
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await expect(page.getByRole("tab", { name: /^Plan/ })).toContainText("Failed");
});

test("an agent asked for the plan that writes none has failed, and can be asked again", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Forget the notes. [fake:no-document]");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  await expect(thread.getByRole("region", { name: "The plan failed" })).toContainText("No document written");
  await expect(thread.getByText("Plan v1")).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("a setup failure sends admins to the fix and tells members an admin is needed", async ({
  adminApi,
  adminPage,
  memberPage,
  workspace,
}) => {
  const space = await createSpaceWithMissingRepository(adminApi);
  const task = await createTask(adminApi, space.projectId, "Explain the code.");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  const adminNotice = await openFailure(adminPage, space.projectSlug, task.id, "Repository not reachable");
  await expect(adminNotice.getByRole("link", { name: "Fix repository settings" })).toHaveAttribute(
    "href",
    `/spaces/${space.projectSlug}/settings/repository`,
  );

  const memberNotice = await openFailure(memberPage, space.projectSlug, task.id, "Repository not reachable");
  await expect(memberNotice).toContainText("A workspace admin needs to fix");
  await expect(memberNotice.getByRole("link", { name: "Fix repository settings" })).toHaveCount(0);
});

test("a setup failure pauses the agent, and once an admin fixes it, retrying the paused runs finishes the work", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(180_000);
  const space = await createSpaceWithMissingRepository(adminApi);
  const task = await createTask(adminApi, space.projectId, "Explain the code.");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  await page.goto(`/spaces/${space.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  const paused = thread.getByRole("region", { name: "Paused until the setup is fixed" });
  await expect(paused).toBeVisible({ timeout: 15_000 });
  await expect(thread.getByRole("region", { name: "The plan failed" })).toContainText("Repository not reachable");

  // The admin points the space at the right repository, then tries every paused run again.
  const integrations = await (await adminApi.get("/api/integrations")).json();
  const github = (integrations?.data ?? integrations).find((integration: { system: string }) => integration.system === "github");
  const fixed = await adminApi.put(`/api/spaces/${space.projectId}/scm-config`, {
    data: { integrationId: github.id, sourceRepository: E2E.workerReachableRepositoryUrl, baseBranch: "main" },
  });
  expect(fixed.ok()).toBe(true);
  await paused.getByRole("button", { name: "Retry all paused runs" }).click();

  await expect(thread.getByText("Plan v1")).toBeVisible({ timeout: 120_000 });
  expect(await planDocument(adminApi, task.id)).toContain("# Fake Plan");
  await expect(paused).toHaveCount(0);
});
