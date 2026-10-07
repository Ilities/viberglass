import type { TaskActivityEntry } from "@viberglass/types";
import type { AgentQuestionRecord } from "../../../../persistence/agentSession/AgentQuestionDAO";
import type { TaskAgentTurn } from "../../../../persistence/agentSession/TaskAgentTurnDAO";
import { TaskTimelineService } from "../../../../services/tasks/TaskTimelineService";

const MARIA = { id: "maria", name: "Maria" };

function activity(id: string, at: string, kind: TaskActivityEntry["kind"], payload: Record<string, unknown> = {}): TaskActivityEntry {
  return { id, ticketId: "t", actorType: "human", actor: MARIA, kind, payload, createdAt: at };
}

function agentTurn(id: string, at: string, jobId: string, outcome: TaskAgentTurn["outcome"] = null): TaskAgentTurn {
  return {
    id,
    sessionId: "s-1",
    agent: { id: "claude", name: "Claude" },
    action: "plan",
    status: outcome ? "completed" : "running",
    outcome,
    jobId,
    createdAt: new Date(at),
  };
}

function revision(
  id: string,
  at: string,
  phase: "planning",
  source: "agent" | "manual",
  version: number,
  author: typeof MARIA | null = null,
) {
  return {
    id,
    documentId: `doc-${phase}`,
    ticketId: "t",
    phase,
    content: "…",
    source,
    actor: author ? "maria@example.com" : null,
    version,
    agentTurnId: null,
    createdAt: new Date(at),
    authorId: author?.id ?? null,
    authorName: author?.name ?? null,
  };
}

function service(sources: {
  messages?: Array<{ id: string; at: string; body: string }>;
  sessionMessages?: Array<{ id: string; at: string; body: string }>;
  revisions?: ReturnType<typeof revision>[];
  activity?: TaskActivityEntry[];
  agentTurns?: TaskAgentTurn[];
  summaries?: Array<{ id: string; ticketId: string; version: number; content: string; agentTurnId: string | null; createdAt: Date }>;
  questions?: AgentQuestionRecord[];
  answers?: Map<string, string>;
}) {
  return new TaskTimelineService({
    messages: {
      list: jest.fn(async () =>
        (sources.messages ?? []).map((m) => ({ id: m.id, ticketId: "t", author: MARIA, body: m.body, createdAt: m.at, editedAt: null })),
      ),
    },
    sessionMessages: {
      listForTask: jest.fn(async () =>
        (sources.sessionMessages ?? []).map((m) => ({ id: m.id, sessionId: "s-1", author: MARIA, body: m.body, createdAt: new Date(m.at) })),
      ),
    },
    agentTurns: { listForTask: jest.fn(async () => sources.agentTurns ?? []) },
    revisions: { listByTicketWithAuthors: jest.fn(async () => sources.revisions ?? []) },
    activity: { list: jest.fn(async () => sources.activity ?? []) },
    summaries: { listForTask: jest.fn(async () => sources.summaries ?? []) },
    questions: {
      listForTask: jest.fn(async () => sources.questions ?? []),
      questionsAnsweredBy: jest.fn(async () => sources.answers ?? new Map<string, string>()),
    },
  });
}

describe("TaskTimelineService", () => {
  it("puts messages, document versions and events in one thread, oldest first", async () => {
    const thread = await service({
      messages: [{ id: "m-1", at: "2026-10-01T10:05:00.000Z", body: "Which tone fits?" }],
      sessionMessages: [{ id: "turn-1", at: "2026-10-01T10:03:00.000Z", body: "Look at the checkout too" }],
      revisions: [revision("r-1", "2026-10-01T10:04:00.000Z", "planning", "agent", 1)],
      activity: [activity("a-1", "2026-10-01T10:00:00.000Z", "task_created")],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["a-1", "turn-1", "r-1", "m-1"]);
    expect(thread[1]).toMatchObject({ kind: "message", channel: "session", sessionId: "s-1" });
    expect(thread[3]).toMatchObject({ kind: "message", channel: "thread", sessionId: null });
  });

  it("shows the plan's versions by number, and credits hand edits to their author", async () => {
    const thread = await service({
      revisions: [
        revision("r-1", "2026-10-01T10:00:00.000Z", "planning", "agent", 1),
        revision("r-2", "2026-10-01T10:01:00.000Z", "planning", "manual", 2, MARIA),
      ],
    }).list("t");

    expect(thread).toEqual([
      expect.objectContaining({ id: "r-1", artifact: "plan", version: 1, byAgent: true, author: null }),
      expect.objectContaining({ id: "r-2", artifact: "plan", version: 2, byAgent: false, author: MARIA }),
    ]);
  });

  it("leaves out activity the thread already shows as a message or a version", async () => {
    const thread = await service({
      activity: [
        activity("posted", "2026-10-01T10:00:00.000Z", "message_posted"),
        activity("edited", "2026-10-01T10:01:00.000Z", "document_edited"),
        activity("owner", "2026-10-01T10:02:00.000Z", "owner_changed"),
      ],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["owner"]);
  });

  it("shows a message before what it caused when both happen at once", async () => {
    const at = "2026-10-01T10:00:00.000Z";
    const thread = await service({
      messages: [{ id: "m-1", at, body: "Go" }],
      activity: [activity("run", at, "run_started")],
      agentTurns: [agentTurn("turn-1", at, "job-9")],
      revisions: [revision("r-1", at, "planning", "agent", 1)],
    }).list("t");

    expect(thread.map((entry) => entry.kind)).toEqual(["message", "agent_turn", "artifact_version", "event"]);
  });

  it("shows the agent's turns, and leaves out the run events a turn already tells", async () => {
    const outcome = { intent: "Writing the plan", reply: "Writing the plan\n\nDone.", produced: ["plan" as const], codeDiscarded: false, resumed: false };
    const thread = await service({
      agentTurns: [agentTurn("turn-1", "2026-10-01T10:01:00.000Z", "job-1", outcome)],
      activity: [
        activity("started", "2026-10-01T10:01:00.000Z", "run_started", { jobId: "job-1" }),
        activity("finished", "2026-10-01T10:03:00.000Z", "run_finished", { jobId: "job-1" }),
        activity("other", "2026-10-01T10:04:00.000Z", "run_finished", { jobId: "job-claw" }),
        activity("cancelled", "2026-10-01T10:05:00.000Z", "run_cancelled", { jobId: "job-1" }),
      ],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["turn-1", "other", "cancelled"]);
    expect(thread[0]).toMatchObject({ kind: "agent_turn", agent: { name: "Claude" }, action: "plan", outcome, jobId: "job-1", sessionId: "s-1" });
  });

  it("shows the agent's questions after the turn that asked, without the activity that repeats them", async () => {
    const question: AgentQuestionRecord = {
      id: "q-1",
      ticketId: "t",
      sessionId: "s-1",
      turnId: "turn-1",
      agent: { id: "claude", name: "Claude" },
      askedOf: MARIA,
      question: "Which warehouse?",
      options: ["North", "South"],
      blocking: true,
      status: "open",
      askedAt: "2026-10-01T10:01:30.000Z",
      answer: null,
      dueAt: new Date("2026-10-01T14:01:30.000Z"),
      remindedAt: null,
    };
    const thread = await service({
      agentTurns: [agentTurn("turn-1", "2026-10-01T10:01:00.000Z", "job-1")],
      questions: [question],
      activity: [activity("asked", "2026-10-01T10:01:30.000Z", "question_asked", { questionId: "q-1" })],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["turn-1", "q-1"]);
    expect(thread[1]).toEqual({
      kind: "question",
      id: "q-1",
      at: "2026-10-01T10:01:30.000Z",
      question: {
        id: "q-1",
        sessionId: "s-1",
        agent: { id: "claude", name: "Claude" },
        askedOf: MARIA,
        question: "Which warehouse?",
        options: ["North", "South"],
        blocking: true,
        status: "open",
        askedAt: "2026-10-01T10:01:30.000Z",
        answer: null,
      },
    });
  });

  it("leaves out a message that answered a question, which shows under the question", async () => {
    const thread = await service({
      messages: [
        { id: "answer", at: "2026-10-01T10:02:00.000Z", body: "North" },
        { id: "other", at: "2026-10-01T10:03:00.000Z", body: "Thanks" },
      ],
      answers: new Map([["answer", "Which warehouse?"]]),
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["other"]);
  });
});
