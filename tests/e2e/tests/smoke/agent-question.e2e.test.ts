import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { createTask, needsYou, researchDocument, runStatus, startResearch, timeline } from "../../playwright/tasks";

test("the agent asks the person who asked for the task; it's their move, and answering resumes the research with the answer", async ({
  adminApi,
  memberApi,
  memberPage: page,
  workspace,
}) => {
  test.setTimeout(240_000);
  // The member asks for it, so they're its requester; the fake agent asks them which greeting to use.
  const task = await createTask(
    memberApi,
    workspace.projectId,
    "Explain greeting.js. [fake:ask=Which greeting should the docs use?|Hello|Hi there] [fake:ask-of=requester]",
  );
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 120_000 }).toBe("completed");

  // The question reached a named person: it's in the thread, and on their Home as theirs to answer.
  const question = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "question");
  expect(question).toMatchObject({
    question: { question: "Which greeting should the docs use?", options: ["Hello", "Hi there"], blocking: true, status: "open", askedOf: { name: E2E.member.name } },
  });
  await expect.poll(() => needsYou(memberApi)).toContain(`${task.title}: Question for ${E2E.member.name}`);
  // The blocked turn wrote nothing: the research waits for the answer.
  expect(await researchDocument(adminApi, task.id)).toBe("");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${task.id}`);
  const thread = page.getByRole("region", { name: "Thread" });
  await expect(thread.getByRole("listitem", { name: "Fake Agent's question" })).toContainText(`Fake Agent asks ${E2E.member.name}`);
  const answer = thread.getByRole("group", { name: "Answer Fake Agent's question" });
  await answer.getByRole("button", { name: "Hi there" }).click();

  // Answering asks for the research again; the agent continues its session with the answer and writes it.
  await expect(thread.getByText("Research v1")).toBeVisible({ timeout: 120_000 });
  const research = await researchDocument(adminApi, task.id);
  expect(research).toContain("This is turn 2 of its session");
  expect(research).toContain('in-answer-to="Which greeting should the docs use?"');
  expect(research).toContain("Hi there");
  await expect(thread.getByRole("listitem", { name: "Fake Agent's question" })).toContainText(`${E2E.member.name} answered: Hi there`);
  await expect(answer).toHaveCount(0);
  await expect.poll(() => needsYou(memberApi)).not.toContain(`${task.title}: Question for ${E2E.member.name}`);
});
