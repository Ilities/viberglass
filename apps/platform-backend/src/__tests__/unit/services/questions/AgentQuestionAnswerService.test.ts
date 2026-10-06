import { AgentQuestionAnswerService } from "../../../../services/questions/AgentQuestionAnswerService";
import { AGENT_QUESTION_ERROR_CODE } from "../../../../services/errors/AgentQuestionError";

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    ticketId: "t-1",
    sessionId: "s-1",
    turnId: "turn-1",
    agent: { id: "claude", name: "Claude" },
    askedOf: { id: "u-maria", name: "Maria" },
    question: "Which warehouse?",
    options: [],
    blocking: true,
    status: "open",
    askedAt: "2026-10-02T09:00:00.000Z",
    answer: null,
    dueAt: null,
    remindedAt: null,
    ...overrides,
  };
}

function setup(asked = question()) {
  const deps = {
    questions: { getById: jest.fn().mockResolvedValue(asked), answer: jest.fn().mockResolvedValue(true) },
    sessions: {
      getById: jest.fn().mockResolvedValue({ id: "s-1", latestPendingRequestId: "q-1" }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    turns: { getById: jest.fn().mockResolvedValue({ id: "turn-1", action: "plan" }) },
    asker: {
      ask: jest.fn().mockResolvedValue({
        session: { id: "s-1" },
        currentTurn: { id: "turn-2" },
        job: { id: "job-2", status: "pending" },
        messageId: "m-1",
      }),
    },
    policy: { assertCanAsk: jest.fn().mockResolvedValue(undefined) },
    discussion: { create: jest.fn().mockResolvedValue("m-1") },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new AgentQuestionAnswerService(deps) };
}

describe("AgentQuestionAnswerService", () => {
  it("asks the agent for the step the question stopped, with the answer as the message", async () => {
    const { deps, service } = setup();
    await service.answer("t-1", "q-1", "u-maria", "  North  ");

    expect(deps.policy.assertCanAsk).toHaveBeenCalledWith("u-maria", "t-1", "plan");
    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "u-maria", "North");
    // Linked before the agent is asked, so the turn's prompt can say what the message answers.
    expect(deps.questions.answer.mock.invocationCallOrder[0]).toBeLessThan(deps.asker.ask.mock.invocationCallOrder[0]);
    expect(deps.questions.answer).toHaveBeenCalledWith("q-1", { by: "u-maria", text: "North", messageId: "m-1" });
    expect(deps.asker.ask).toHaveBeenCalledWith("t-1", "u-maria", { message: "North", action: "plan", agentId: "claude", postedMessageId: "m-1" });
    expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { latestPendingRequestId: null });
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-maria" }, "question_answered", { questionId: "q-1" });
  });

  it("sends the answer to a question that didn't block as a reply", async () => {
    const { deps, service } = setup(question({ blocking: false }));
    await service.answer("t-1", "q-1", "u-tomi", "Yes, dark mode too");
    expect(deps.asker.ask).toHaveBeenCalledWith("t-1", "u-tomi", { message: "Yes, dark mode too", action: "reply", agentId: "claude", postedMessageId: "m-1" });
    expect(deps.turns.getById).not.toHaveBeenCalled();
  });

  it("refuses an empty answer, a question from another task, and one answered already", async () => {
    await expect(setup().service.answer("t-1", "q-1", "u", "  ")).rejects.toMatchObject({ code: AGENT_QUESTION_ERROR_CODE.NO_ANSWER });
    await expect(setup().service.answer("t-2", "q-1", "u", "x")).rejects.toMatchObject({ code: AGENT_QUESTION_ERROR_CODE.QUESTION_NOT_FOUND });
    const answered = setup(question({ status: "answered" }));
    await expect(answered.service.answer("t-1", "q-1", "u", "x")).rejects.toMatchObject({ code: AGENT_QUESTION_ERROR_CODE.ALREADY_ANSWERED });
    expect(answered.deps.asker.ask).not.toHaveBeenCalled();
    expect(answered.deps.discussion.create).not.toHaveBeenCalled();
  });

  it("posts nothing when the person may not ask for the step the question stopped", async () => {
    const { deps, service } = setup();
    deps.policy.assertCanAsk.mockRejectedValue(new Error("Only the owner can ask for the build"));
    await expect(service.answer("t-1", "q-1", "u-maria", "North")).rejects.toThrow("Only the owner");
    expect(deps.discussion.create).not.toHaveBeenCalled();
    expect(deps.questions.answer).not.toHaveBeenCalled();
  });

  it("starts one turn when two people answer at once", async () => {
    const asked = question();
    const { deps, service } = setup(asked);
    deps.questions.answer.mockImplementation(async () => {
      asked.status = "answered";
      return true;
    });
    const results = await Promise.allSettled([service.answer("t-1", "q-1", "u-a", "North"), service.answer("t-1", "q-1", "u-b", "South")]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(deps.asker.ask).toHaveBeenCalledTimes(1);
  });
});
