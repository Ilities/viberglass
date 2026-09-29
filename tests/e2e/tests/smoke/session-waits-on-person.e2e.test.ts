import {
  createTask,
  researchDocument,
  runStatus,
  sessionStatus,
  startLiveResearchSession,
} from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("a live turn that writes no document leaves the session waiting on the person, who can reply", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Research the greeting function.");
  const { sessionId, jobId } = await startLiveResearchSession(
    adminApi,
    task.id,
    workspace.clankerId,
    "Just tell me what you find first. [fake:no-document]",
  );

  // The turn ends without a document: the agent answered, so it's the person's move.
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 60_000 }).toBe("completed");
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 10_000 }).toBe("waiting_on_user");

  await page.goto(`/project/${workspace.projectSlug}/sessions/${sessionId}`);
  await expect(page.getByText("Waiting on you").first()).toBeVisible();

  // Replying starts the next turn, which writes the document and completes the session.
  // A resumed turn's prompt is only the reply (a real agent keeps the conversation), and
  // the fake agent has no memory, so the reply names the document it should write.
  const composer = page.getByPlaceholder(/Send a message/);
  await composer.fill("Thanks, now write it up in RESEARCH.md.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 90_000 }).toBe("completed");
  expect(await researchDocument(adminApi, task.id)).toContain("now write it up");
  await expect(page.getByText("Completed").first()).toBeVisible();
});
