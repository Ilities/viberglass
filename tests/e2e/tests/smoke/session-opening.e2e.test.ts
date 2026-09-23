import {
  createTask,
  researchDocument,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("what the person writes when opening a session reaches the agent", async ({
  adminApi,
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

  // The fake agent echoes its prompt into the document.
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 90_000 }).toBe("completed");
  expect(await researchDocument(adminApi, task.id)).toContain(opening);
});
