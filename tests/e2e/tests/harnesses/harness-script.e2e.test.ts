import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../../playwright/harnessFixtures";
import type { HarnessStep, HarnessUnderTest } from "../../playwright/harnessMatrix";
import type { RecordedModelRequest } from "../../playwright/mockModel/MockModelServer";
import { MOCK_MODEL } from "../../playwright/mockModel/MockModelServer";
import type { MockToolCall } from "../../playwright/mockModel/mockModelTypes";
import { asksHuman, MOCK_CHANGE_FILE, MOCK_DOCUMENT_HEADING, writesFile } from "../../playwright/mockModel/scriptedModel";
import { askAgent, createTask, planDocument, runStatus, startPlan, timeline } from "../../playwright/tasks";
import { isWorkerContainerRunning } from "../../playwright/workerContainers";

/** A real harness starts in a fresh container; give it longer than the fake agent. */
const RUN_TIMEOUT = 180_000;

test.describe.configure({ timeout: 420_000 });

function failsWhereKnown(harness: HarnessUnderTest, step: HarnessStep): void {
  const reason = harness.knownFailures?.[step];
  test.fail(reason !== undefined, reason);
}

async function finished(api: APIRequestContext, jobId: string, status = "completed", timeout = RUN_TIMEOUT): Promise<void> {
  await expect
    .poll(() => runStatus(api, jobId), { timeout, intervals: [2_000] })
    .toMatch(/^(completed|failed|cancelled)$/);
  const failure = (await job(api, jobId)).result?.failure;
  expect(await runStatus(api, jobId), failure ? `${failure.code}: ${failure.technicalDetail ?? failure.summary}` : undefined).toBe(status);
}

async function job(api: APIRequestContext, jobId: string): Promise<Record<string, any>> {
  return (await api.get(`/api/jobs/${jobId}`)).json();
}

async function agentTurns(api: APIRequestContext, taskId: string): Promise<Array<Record<string, any>>> {
  return (await timeline(api, taskId)).filter((entry) => entry.kind === "agent_turn");
}

function toolCallsIn(requests: RecordedModelRequest[]): MockToolCall[] {
  return requests.flatMap((request) => (request.reply?.kind === "message" ? request.reply.toolCalls : []));
}

/** Whether a later request carried the tool's result back to the model. */
function resultCameBack(requests: RecordedModelRequest[], call: MockToolCall): boolean {
  return requests.some((request) => request.conversation?.messages.some((message) => message.role === "tool" && message.callId === call.id));
}

function writeTo(requests: RecordedModelRequest[], file: string): MockToolCall | undefined {
  return toolCallsIn(requests).find((call) => writesFile(call, file));
}

test("writes the plan with its own tools through the model endpoint, and the run records the harness and usage", async ({
  adminApi,
  workspace,
  harness,
  harnessRunnerId,
  mockModel,
}) => {
  failsWhereKnown(harness, "plan");
  const from = mockModel.requests.length;
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");
  const jobId = await startPlan(adminApi, task.id, harnessRunnerId);
  await finished(adminApi, jobId);

  const plan = await planDocument(adminApi, task.id);
  expect(plan).toContain(MOCK_DOCUMENT_HEADING);
  expect(plan).toContain("This is prompt 1 of the conversation.");
  expect(plan).toContain("Explain how greeting.js works.");

  const requests = mockModel.requests.slice(from);
  expect(mockModel.unknownRequests()).toEqual([]);
  expect(requests.filter((request) => request.conversation).every((request) => request.conversation?.model === MOCK_MODEL)).toBe(true);
  const write = writeTo(requests, "PLAN.md");
  expect(write, "the harness's write tool was called").toBeDefined();
  expect(resultCameBack(requests, write!)).toBe(true);

  const [turn] = await agentTurns(adminApi, task.id);
  expect(turn.outcome).toMatchObject({ resumed: false });

  const record = await (await adminApi.get(`/api/jobs/${jobId}/record`)).json();
  expect(record).toMatchObject({ agent: harness.agent, success: true, usageAvailable: true });
  expect(record.usage.inputTokens).toBeGreaterThan(0);
  expect(record.usage.outputTokens).toBeGreaterThan(0);
});

test("continues its session on the next turn, with the earlier turn in the conversation", async ({ adminApi, harness, workspace, harnessRunnerId, mockModel }) => {
  failsWhereKnown(harness, "continue");
  const task = await createTask(adminApi, workspace.projectId, "Explain how greeting.js works.");
  await finished(adminApi, await startPlan(adminApi, task.id, harnessRunnerId));

  const from = mockModel.requests.length;
  const revision = await askAgent(adminApi, task.id, { action: "plan", body: "Mention the farewell function too.", agentId: harnessRunnerId });
  await finished(adminApi, revision.jobId);

  const plan = await planDocument(adminApi, task.id);
  expect(plan).toContain("This is prompt 2 of the conversation.");
  expect(plan).toContain("Mention the farewell function too.");
  const firstRequest = mockModel.requests.slice(from).find((request) => request.conversation);
  expect(JSON.stringify(firstRequest?.conversation?.messages)).toContain("Explain how greeting.js works.");
  expect((await agentTurns(adminApi, task.id))[1].outcome).toMatchObject({ resumed: true });
});

test("asks with ask_human and carries on with the answer", async ({ adminApi, harness, workspace, harnessRunnerId, mockModel }) => {
  failsWhereKnown(harness, "question");
  const from = mockModel.requests.length;
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [mock:ask=Which greeting should the docs use?|Hello|Hi there]");
  await finished(adminApi, await startPlan(adminApi, task.id, harnessRunnerId));

  const asked = toolCallsIn(mockModel.requests.slice(from)).find(asksHuman);
  expect(JSON.stringify(asked?.arguments)).toContain("Which greeting should the docs use?");
  const question: Record<string, any> | undefined = (await timeline(adminApi, task.id)).find((entry) => entry.kind === "question");
  expect(question).toMatchObject({ question: { question: "Which greeting should the docs use?", options: ["Hello", "Hi there"], status: "open" } });
  expect(await planDocument(adminApi, task.id)).toBe("");

  const response = await adminApi.post(`/api/tasks/${task.id}/questions/${question!.question.id}/answer`, { data: { answer: "Hi there" } });
  expect(response.ok(), await response.text()).toBe(true);
  const answered = await response.json();
  await finished(adminApi, answered.jobId ?? answered.turn?.jobId ?? answered.data?.jobId);

  const plan = await planDocument(adminApi, task.id);
  expect(plan).toContain("This is prompt 2 of the conversation.");
  expect(plan).toContain("Hi there");
});

test("changes code with its own tools; the worker commits it, and the read-only fixture refuses the push", async ({
  adminApi,
  harness,
  workspace,
  harnessRunnerId,
  mockModel,
}) => {
  failsWhereKnown(harness, "code");
  const from = mockModel.requests.length;
  const task = await createTask(adminApi, workspace.projectId, "Add a farewell.");
  const build = await askAgent(adminApi, task.id, { action: "code", body: "Build it. [mock:code]", agentId: harnessRunnerId });
  await finished(adminApi, build.jobId, "failed");

  const requests = mockModel.requests.slice(from);
  const write = writeTo(requests, MOCK_CHANGE_FILE);
  expect(write, "the harness's write tool was called").toBeDefined();
  expect(resultCameBack(requests, write!)).toBe(true);
  // Not AGENT_NO_CHANGES: the change reached the working tree and was committed.
  expect((await job(adminApi, build.jobId)).result?.failure?.code).toBe("REPOSITORY_WRITE_FAILED");
});

test("cancelling a run stops the harness mid-request", async ({ adminApi, harness, workspace, harnessRunnerId, mockModel }) => {
  failsWhereKnown(harness, "cancel");
  const from = mockModel.requests.length;
  const task = await createTask(adminApi, workspace.projectId, "Take your time. [mock:sleep=300]");
  const jobId = await startPlan(adminApi, task.id, harnessRunnerId);
  const heldBack = () => mockModel.requests.slice(from).find((request) => request.reply?.kind === "message" && request.reply.delayMs > 0);
  await expect.poll(() => heldBack() !== undefined, { timeout: RUN_TIMEOUT }).toBe(true);

  const cancel = await adminApi.post(`/api/jobs/${jobId}/cancel`);
  expect(cancel.ok(), await cancel.text()).toBe(true);
  await expect.poll(() => isWorkerContainerRunning(jobId), { timeout: 30_000 }).toBe(false);
  await expect.poll(() => heldBack()?.abandoned, { timeout: 15_000 }).toBe(true);
  expect(await runStatus(adminApi, jobId)).toBe("cancelled");
  expect(await planDocument(adminApi, task.id)).toBe("");
});

test("a key the model endpoint rejects fails the run as a rejected key", async ({ adminApi, harness, workspace, harnessRunnerId }) => {
  failsWhereKnown(harness, "rejected-key");
  const task = await createTask(adminApi, workspace.projectId, "Explain greeting.js. [mock:fail=401]");
  const jobId = await startPlan(adminApi, task.id, harnessRunnerId);
  // Claude Code retries a rejected key for about three minutes before it gives up.
  await finished(adminApi, jobId, "failed", 240_000);
  expect((await job(adminApi, jobId)).result?.failure?.code).toBe("AGENT_CREDENTIAL_INVALID");
});
