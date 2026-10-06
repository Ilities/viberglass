import type { TaskPlanParts } from "@viberglass/types";
import type { AgentTurn } from "../../../../persistence/agentSession/AgentTurnDAO";
import type { PhaseDocumentComment } from "../../../../persistence/ticketing/TicketPhaseDocumentCommentDAO";
import { TaskTurnContextLoader } from "../../../../services/taskTurns/TaskTurnContextLoader";

const PARTS: TaskPlanParts = {
  parts: [
    { number: 1, title: "Store it", status: "merged", pullRequestUrl: "https://github.com/a/b/pull/1" },
    { number: 2, title: "Show it", status: "not_built", pullRequestUrl: null },
  ],
  open: null,
  next: 2,
};

const TICKET = {
  id: "t",
  projectId: "p",
  title: "Dark mode",
  description: "Let people switch",
  externalTicketId: undefined,
  pullRequestUrl: undefined,
};

function turn(overrides: Partial<AgentTurn>): AgentTurn {
  return {
    id: "turn",
    sessionId: "s",
    role: "assistant",
    status: "completed",
    sequence: 1,
    contentMarkdown: null,
    contentJson: null,
    jobId: null,
    userId: null,
    consumedByTurnId: null,
    action: "plan",
    taskMessageId: null,
    buildParts: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    ...overrides,
  };
}

function comment(id: string, createdAt: string, status: "open" | "resolved" = "open"): PhaseDocumentComment {
  return {
    id,
    documentId: "d",
    ticketId: "t",
    phase: "planning",
    lineNumber: 1,
    quote: null,
    content: id,
    status,
    actor: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

function message(id: string, createdAt: string) {
  return { id, ticketId: "t", author: { id: "u", name: "Maria" }, body: id, createdAt, editedAt: null };
}

function loader(sources: { turns?: AgentTurn[]; comments?: PhaseDocumentComment[]; summary?: { content: string; createdAt: Date } } = {}) {
  const summary = sources.summary ?? null;
  const revisions = { listHandEditsSince: jest.fn().mockResolvedValue([]) };
  const pullRequest = { forTask: jest.fn() };
  const instance = new TaskTurnContextLoader({
    messages: {
      list: jest.fn().mockResolvedValue([message("before", "2026-10-01T09:59:00Z"), message("after", "2026-10-01T10:30:00Z")]),
    },
    turns: { listBySession: jest.fn().mockResolvedValue(sources.turns ?? []) },
    comments: {
      listByTicketAndPhase: jest.fn(async (_ticketId: string, phase: string) => (phase === "planning" ? sources.comments ?? [] : [])),
    },
    revisions,
    summaries: { latest: jest.fn().mockResolvedValue(summary) },
    documents: { getOrCreateDocument: jest.fn(async (_id: string, phase: string) => ({ content: phase === "planning" ? " # P \n" : "" })) },
    pullRequest,
    participants: {
      list: jest.fn().mockResolvedValue([
        { userId: "u-maria", name: "Maria", email: "maria@example.com", role: "requester", addedAt: "" },
        { userId: "u-maria", name: "Maria", email: "maria@example.com", role: "owner", addedAt: "" },
        { userId: "u-tomi", name: "Tomi", email: "tomi@example.com", role: "reviewer", addedAt: "" },
      ]),
    },
    questions: { questionsAnsweredBy: jest.fn().mockResolvedValue(new Map([["after", "Which warehouse?"]])) },
    agentTurns: {
      listForTask: jest.fn().mockResolvedValue([
        { id: "a", outcome: { commit: "abc123" } },
        { id: "b", outcome: { commit: null } },
        { id: "c", outcome: null },
      ]),
    },
    parts: { state: jest.fn().mockResolvedValue(PARTS) },
  });
  return { instance, revisions, pullRequest };
}

describe("TaskTurnContextLoader", () => {
  const input = { ticket: TICKET, sessionId: "s", turnId: "current", action: "plan" as const, sessionMessages: [] };

  it("on the agent's first turn, everything is new", async () => {
    const { instance, revisions } = loader({ comments: [comment("c-1", "2026-10-01T09:00:00Z")] });

    const context = await instance.load(input);

    expect(context.since).toBeNull();
    expect(context.fresh.messages.map((m) => m.body)).toEqual(["before", "after"]);
    expect(context.fresh.comments.map((c) => c.comment.id)).toEqual(["c-1"]);
    expect(context.earlier).toEqual({ messages: [], openComments: [] });
    expect(revisions.listHandEditsSince).not.toHaveBeenCalled();
    expect(context.documents).toEqual({ plan: "# P" });
  });

  it("names the people on the task with their roles, and marks the answers to the agent's questions", async () => {
    const context = await loader().instance.load(input);

    // People pushed after this commit is what the next turn is told about.
    expect(context.lastAgentCommit).toBe("abc123");
    expect(context.people).toEqual([
      { name: "Maria", roles: ["requester", "owner"] },
      { name: "Tomi", roles: ["reviewer"] },
    ]);
    expect(context.fresh.messages.map((m) => [m.body, m.inAnswerTo])).toEqual([
      ["before", undefined],
      ["after", "Which warehouse?"],
    ]);
  });

  it("gives an agent new to the task the summary instead of the messages it covers", async () => {
    const { instance } = loader({ summary: { content: " # Summary\n- agreed ", createdAt: new Date("2026-10-01T10:00:00Z") } });

    const context = await instance.load(input);

    expect(context.summary).toBe("# Summary\n- agreed");
    expect(context.fresh.messages.map((m) => m.body)).toEqual(["after"]);
  });

  it("splits what the agent saw from what's new at its last finished turn", async () => {
    const { instance, revisions } = loader({
      turns: [
        turn({ id: "answered", status: "completed", createdAt: new Date("2026-10-01T10:00:00Z") }),
        // A failed turn's prompt may never have arrived, so what it was sent counts as new.
        turn({ id: "failed", status: "failed", createdAt: new Date("2026-10-01T10:20:00Z") }),
        turn({ id: "current", status: "queued", createdAt: new Date("2026-10-01T10:40:00Z") }),
        turn({ id: "person", role: "user", createdAt: new Date("2026-10-01T10:35:00Z") }),
      ],
      comments: [
        comment("seen", "2026-10-01T09:00:00Z"),
        comment("new", "2026-10-01T10:10:00Z"),
        comment("resolved", "2026-10-01T10:11:00Z", "resolved"),
      ],
    });

    const context = await instance.load(input);

    expect(context.since).toEqual(new Date("2026-10-01T10:00:00Z"));
    expect(context.earlier.messages.map((m) => m.body)).toEqual(["before"]);
    expect(context.fresh.messages.map((m) => m.body)).toEqual(["after"]);
    expect(context.earlier.openComments.map((c) => c.comment.id)).toEqual(["seen"]);
    expect(context.fresh.comments.map((c) => c.comment.id)).toEqual(["new"]);
    expect(revisions.listHandEditsSince).toHaveBeenCalledWith("t", new Date("2026-10-01T10:00:00Z"));
  });

  it("counts what was said in the live session as new whenever it was sent", async () => {
    const { instance } = loader({ turns: [turn({ id: "answered", createdAt: new Date("2026-10-01T10:00:00Z") })] });

    const context = await instance.load({
      ...input,
      sessionMessages: [turn({ id: "live", role: "user", contentMarkdown: "[Tomi]: and mobile?", createdAt: new Date("2026-10-01T09:58:00Z") })],
    });

    expect(context.fresh.messages).toEqual([
      { author: null, body: "[Tomi]: and mobile?", at: new Date("2026-10-01T09:58:00Z"), via: "session" },
      expect.objectContaining({ body: "after" }),
    ]);
  });

  it("keeps the latest hand edit of the plan", async () => {
    const { instance, revisions } = loader({ turns: [turn({ id: "answered" })] });
    revisions.listHandEditsSince.mockResolvedValue([
      { phase: "planning", content: "first", authorName: "Maria", actor: "m@example.com" },
      { phase: "planning", content: "second", authorName: null, actor: "t@example.com" },
      { phase: "execution", content: "not a plan", authorName: "Maria", actor: "m@example.com" },
    ]);

    const context = await instance.load(input);

    expect(context.fresh.edits).toEqual([{ artifact: "plan", by: "t@example.com", content: "second" }]);
  });

  it("reads the pull request's review comments only for a build on a task that has one", async () => {
    const { instance, pullRequest } = loader();
    const review = { kind: "review" as const, author: "rev", body: "Nice", path: null, line: null, url: null, createdAt: null };
    pullRequest.forTask.mockResolvedValue({ comments: [review] });

    await instance.load(input);
    expect(pullRequest.forTask).not.toHaveBeenCalled();

    const context = await instance.load({ ...input, action: "code", ticket: { ...TICKET, pullRequestUrl: "https://github.com/a/b/pull/1" } });
    expect(context.fresh.pullRequestComments).toEqual([review]);
  });

  it("gives a build of new parts no pull request to continue, and names the parts", async () => {
    const { instance, pullRequest } = loader();
    const ticket = { ...TICKET, pullRequestUrl: "https://github.com/a/b/pull/1" };

    const context = await instance.load({ ...input, action: "code", ticket, buildParts: { first: 2, last: 2 } });

    expect(pullRequest.forTask).not.toHaveBeenCalled();
    expect(context.ticket.pullRequestUrl).toBeNull();
    expect(context.parts).toEqual({ building: "part 2, “Show it”", built: "Part 1" });
  });
});
