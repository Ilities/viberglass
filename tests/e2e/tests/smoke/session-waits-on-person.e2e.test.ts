import { askAgent, createTask, planDocument, runStatus, sessionStatus } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("a turn that writes no document leaves it the person's move, who can reply in the thread", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  const task = await createTask(adminApi, workspace.projectId, "Look into the greeting function.");
  const { sessionId, jobId } = await askAgent(adminApi, task.id, {
    action: "reply",
    body: "Just tell me what you find first. [fake:no-document]",
    agentId: workspace.clankerId,
  });

  // The turn ends without a document: the agent answered, so it's the person's move.
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 60_000 }).toBe("completed");
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 10_000 }).toBe("waiting_on_user");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  await expect(page.getByLabel("Situation")).toContainText("Your move");

  // Replying to the agent starts the next turn, which writes the document.
  // A resumed turn's prompt is only what's new, so the reply names the document it should write.
  const thread = page.getByRole("region", { name: "Conversation" });
  const composer = thread.getByRole("combobox", { name: "Write a message" });
  await composer.fill("@");
  await thread.getByRole("option", { name: /Fake Agent/ }).click();
  await composer.fill(`${await composer.inputValue()}Thanks, now write it up in PLAN.md.`);
  await thread.getByRole("button", { name: "Post" }).click();

  await expect.poll(() => planDocument(adminApi, task.id), { timeout: 90_000 }).toContain("now write it up");
  await expect.poll(() => sessionStatus(adminApi, sessionId), { timeout: 10_000 }).toBe("waiting_on_user");
});
