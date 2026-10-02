import {
  createTask,
  researchDocument,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";
import { expect, test } from "../../playwright/smokeFixtures";

test("a message to the agent during its turn reaches it in its next turn", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const note = "PM NOTE: cover the greeting function in RESEARCH.md";
  // Each turn sleeps, leaving time to write while the agent works.
  const task = await createTask(adminApi, workspace.projectId, "Research carefully. [fake:sleep=8]");
  const { sessionId, jobId } = await startLiveResearchSession(
    adminApi,
    task.id,
    workspace.clankerId,
  );
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(true);

  // Retry: the container start can abort the first load (ERR_NETWORK_CHANGED).
  const thread = page.getByRole("region", { name: "Thread" });
  const composer = thread.getByRole("textbox", { name: "Write a message" });
  await expect(async () => {
    await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
    await expect(composer).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await composer.fill("@");
  await thread.getByRole("option", { name: /Fake Agent/ }).click();
  await composer.fill(`${await composer.inputValue()}${note}`);
  await thread.getByRole("button", { name: "Post" }).click();
  await expect(thread.getByText(note)).toBeVisible();

  // The running turn ends, a follow-up turn delivers the note, then it's the person's move.
  await expect.poll(() => researchDocument(adminApi, task.id), { timeout: 90_000 }).toContain(note);
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 30_000 }).toBe("waiting_on_user");
});
