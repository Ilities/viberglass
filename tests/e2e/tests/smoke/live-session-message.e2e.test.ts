import {
  createTask,
  researchDocument,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("a message queued during a live turn reaches the agent before the session completes", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const note = "PM NOTE: cover the greeting function";
  // Each turn sleeps, leaving time to queue a message while the agent works.
  const task = await createTask(adminApi, workspace.projectId, "Research carefully. [fake:sleep=8]");
  const { sessionId, jobId } = await startLiveResearchSession(
    adminApi,
    task.id,
    workspace.clankerId,
  );
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // Retry: the container start can abort the first load (ERR_NETWORK_CHANGED).
  const composer = page.getByPlaceholder("Agent is working — your message will be queued");
  await expect(async () => {
    await page.goto(`/project/${workspace.projectSlug}/sessions/${sessionId}`);
    await expect(composer).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await composer.fill(note);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Queued").first()).toBeVisible();

  // The first turn ends, a follow-up turn delivers the note, then the session completes.
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 90_000 }).toBe("completed");
  expect(await researchDocument(adminApi, task.id)).toContain(note);

  await page.reload();
  await expect(page.getByText("Completed").first()).toBeVisible();
});
