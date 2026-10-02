import type { AgentQuestionRecord } from "../../../../persistence/agentSession/AgentQuestionDAO";
import { QuestionReminderService } from "../../../../services/questions/QuestionReminderService";

const ASKED_AT = new Date("2026-10-02T09:00:00.000Z");
const hours = (n: number) => new Date(ASKED_AT.getTime() + n * 3_600_000);

function question(overrides: Partial<AgentQuestionRecord> = {}): AgentQuestionRecord {
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
    askedAt: ASKED_AT.toISOString(),
    answer: null,
    dueAt: hours(4),
    remindedAt: null,
    ...overrides,
  };
}

function setup(due: AgentQuestionRecord[], owner = { id: "u-tomi", name: "Tomi" }) {
  const deps = {
    questions: {
      listDue: jest.fn().mockResolvedValue(due),
      markReminded: jest.fn().mockResolvedValue(undefined),
      markEscalated: jest.fn().mockResolvedValue(undefined),
    },
    participants: { listDrivers: jest.fn().mockResolvedValue(new Map([["t-1", owner]])) },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new QuestionReminderService(deps) };
}

describe("QuestionReminderService", () => {
  it("reminds the person asked once it falls due, and waits as long again", async () => {
    const { deps, service } = setup([question()]);
    expect(await service.remindDue(hours(4.1))).toBe(1);

    expect(deps.questions.listDue).toHaveBeenCalledWith(hours(4.1), 50);
    expect(deps.questions.markReminded).toHaveBeenCalledWith("q-1", hours(8.1));
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "system" }, "question_reminded", {
      questionId: "q-1",
      userId: "u-maria",
      question: "Which warehouse?",
      escalated: false,
    });
  });

  it("tells the owner when it falls due again", async () => {
    const { deps, service } = setup([question({ remindedAt: hours(4), dueAt: hours(8) })]);
    await service.remindDue(hours(8));
    expect(deps.questions.markEscalated).toHaveBeenCalledWith("q-1");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "system" }, "question_reminded", {
      questionId: "q-1",
      userId: "u-tomi",
      question: "Which warehouse?",
      askedOfName: "Maria",
      escalated: true,
    });
  });

  it("doesn't tell owners twice about their own question", async () => {
    const { deps, service } = setup([question({ remindedAt: hours(4), askedOf: { id: "u-tomi", name: "Tomi" } })]);
    await service.remindDue(hours(8));
    expect(deps.questions.markEscalated).toHaveBeenCalledWith("q-1");
    expect(deps.activity.record).not.toHaveBeenCalled();
  });
});
