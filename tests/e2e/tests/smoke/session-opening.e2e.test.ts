import {
  createTask,
  researchDocument,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("a session opens with what the person wrote, which reaches the agent", async ({
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

  // The page is titled with the task and opens with the person's message;
  // the full prompt is there on request, not as the first thing to read.
  await page.goto(`/spaces/${workspace.projectSlug}/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  const fullPrompt = page.getByText(/You're working on a task in Viberglass/);
  await expect(fullPrompt).toBeHidden();
  await page.getByText("View full prompt").click();
  await expect(fullPrompt).toBeVisible();
});
