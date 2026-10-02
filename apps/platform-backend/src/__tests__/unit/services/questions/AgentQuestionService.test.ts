import { AgentQuestionService } from "../../../../services/questions/AgentQuestionService";
import { AgentQuestionError } from "../../../../services/errors/AgentQuestionError";

const NOW = new Date("2026-10-02T09:00:00.000Z");

function setup(overrides: { turn?: unknown; reminderHours?: number } = {}) {
  const deps = {
    turns: { getByJobId: jest.fn().mockResolvedValue("turn" in overrides ? overrides.turn : { id: "turn-1", sessionId: "s-1" }) },
    sessions: {
      getById: jest.fn().mockResolvedValue({ id: "s-1", ticketId: "t-1", createdBy: "u-dev" }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1" }) },
    projects: { getProject: jest.fn().mockResolvedValue({ questionReminderHours: overrides.reminderHours ?? 4 }) },
    participants: {
      list: jest.fn().mockResolvedValue([
        { userId: "u-maria", name: "Maria", email: "maria@example.com", role: "requester", addedAt: "" },
        { userId: "u-tomi", name: "Tomi", email: "tomi@example.com", role: "owner", addedAt: "" },
      ]),
    },
    users: { getContact: jest.fn().mockResolvedValue({ name: "Dev", email: "dev@example.com", slackUserId: null, deactivated: false }) },
    questions: { create: jest.fn().mockResolvedValue("q-1") },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
    now: () => NOW,
  };
  return { deps, service: new AgentQuestionService(deps) };
}

describe("AgentQuestionService", () => {
  it("puts the question to the person named, due for a reminder after the space's wait", async () => {
    const { deps, service } = setup({ reminderHours: 2 });
    const asked = await service.ask("job-1", { question: "Which warehouse?", options: ["North", "South"], addressee: "requester", blocking: true });

    expect(asked).toEqual({ id: "q-1", askedOf: "Maria" });
    expect(deps.questions.create).toHaveBeenCalledWith({
      sessionId: "s-1",
      turnId: "turn-1",
      jobId: "job-1",
      question: "Which warehouse?",
      options: ["North", "South"],
      blocking: true,
      addresseeUserId: "u-maria",
      addresseeRole: "requester",
      dueAt: new Date("2026-10-02T11:00:00.000Z"),
    });
    expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { latestPendingRequestId: "q-1" });
    // The activity is what notifies them, and what the thread and audit log read.
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "agent" }, "question_asked", {
      questionId: "q-1",
      userId: "u-maria",
      question: "Which warehouse?",
      blocking: true,
    });
  });

  it("asks the owner when the agent names nobody", async () => {
    const { deps, service } = setup();
    expect(await service.ask("job-1", { question: "OK?", options: [], addressee: null, blocking: false })).toEqual({ id: "q-1", askedOf: "Tomi" });
    expect(deps.questions.create).toHaveBeenCalledWith(expect.objectContaining({ addresseeUserId: "u-tomi", addresseeRole: "driver", blocking: false }));
  });

  it("refuses a run that isn't a task's turn", async () => {
    const { service } = setup({ turn: null });
    await expect(service.ask("job-x", { question: "?", options: [], addressee: null, blocking: true })).rejects.toBeInstanceOf(AgentQuestionError);
  });
});
