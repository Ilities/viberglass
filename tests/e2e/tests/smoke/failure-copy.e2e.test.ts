import type { APIRequestContext, Page } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { createTask, runStatus, startResearch } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

/** Opens a run page, retrying loads aborted by a container start (ERR_NETWORK_CHANGED). */
async function openRun(page: Page, projectSlug: string, jobId: string, heading: string) {
  await expect(async () => {
    await page.goto(`/project/${projectSlug}/jobs/${jobId}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

/** A space whose repository doesn't exist, so every run fails to clone it. */
async function createSpaceWithMissingRepository(api: APIRequestContext) {
  const integrations = await (await api.get("/api/integrations")).json();
  const list: Array<{ id: string; system: string }> = integrations?.data ?? integrations;
  const github = list.find((integration) => integration.system === "github");
  if (!github) throw new Error("The seeded GitHub integration is missing");

  const created = await (
    await api.post("/api/projects", { data: { name: `Broken Space ${Date.now()}` } })
  ).json();
  const project = created?.data ?? created;
  await api.post(`/api/integrations/project/${project.id}/link`, {
    data: { integrationId: github.id, isPrimary: true },
  });
  const configured = await api.put(`/api/projects/${project.id}/scm-config`, {
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
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  await openRun(page, workspace.projectSlug, jobId, "Agent failed");
  await expect(page.getByText("The agent stopped with an error before finishing.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again from the task" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^(Fix|Check)/ })).toHaveCount(0);

  // The Runs list says why, and so does the phase.
  await page.goto(`/project/${workspace.projectSlug}/jobs`);
  await expect(page.getByRole("row", { name: /Agent failed/ })).toBeVisible();
  await page.goto(`/project/${workspace.projectSlug}/tickets/${task.id}`);
  await expect(page.getByRole("button", { name: /^1\s*Research/ })).toContainText("Failed: Agent failed");
});

test("an agent that writes no document is told apart from other failures", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Forget the notes. [fake:no-document]");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  await openRun(page, workspace.projectSlug, jobId, "No document written");
});

test("a setup failure sends admins to the fix and tells members an admin is needed", async ({
  adminApi,
  adminPage,
  memberPage,
  workspace,
}) => {
  const space = await createSpaceWithMissingRepository(adminApi);
  const task = await createTask(adminApi, space.projectId, "Explain the code.");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 90_000 }).toBe("failed");

  await openRun(adminPage, space.projectSlug, jobId, "Repository not reachable");
  await expect(adminPage.getByRole("link", { name: "Fix repository settings" })).toHaveAttribute(
    "href",
    `/project/${space.projectSlug}/settings`,
  );

  await openRun(memberPage, space.projectSlug, jobId, "Repository not reachable");
  await expect(memberPage.getByText(/A workspace admin needs to fix this/)).toBeVisible();
  await expect(memberPage.getByRole("link", { name: "Fix repository settings" })).toHaveCount(0);
});
