import {
  createTask,
  researchDocument,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("a session opens with what the person wrote, which reaches the agent and shows in the task's thread", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const opening = "OPENING NOTE: start from the greeting function";
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");
  const { sessionId } = await startLiveResearchSession(
    adminApi,
    task.id,
    workspace.clankerId,
    opening,
  );

  // The fake agent echoes its prompt into the document; then the session waits for the next message.
  await expect.poll(() => researchDocument(adminApi, task.id), { timeout: 90_000 }).toContain(opening);
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 10_000 }).toBe("waiting_on_user");

  // There's no separate session page: the person's message is in the task's thread.
  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  await expect(page.getByRole("region", { name: "Thread" }).getByText(opening)).toBeVisible();
});
