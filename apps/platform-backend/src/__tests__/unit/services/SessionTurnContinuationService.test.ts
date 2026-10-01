import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import type { AgentSession } from "../../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn } from "../../../persistence/agentSession/AgentTurnDAO";
import type { TaskTurnContext } from "../../../services/taskTurns/taskTurnContext";

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "sess-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    projectSlug: null,
    ticketId: "ticket-1",
    ticketTitle: null,
    clankerId: "clanker-1",
    mode: "research",
    status: "active",
    title: null,
    repository: "org/repo",
    baseBranch: "main",
    workspaceBranch: null,
    draftPullRequestUrl: null,
    headCommitHash: null,
    lastJobId: null,
    lastTurnId: null,
    latestPendingRequestId: null,
    metadataJson: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function makeUserTurn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn-u1",
    sessionId: "sess-1",
    role: "user",
    status: "completed",
    sequence: 5,
    contentMarkdown: "do X",
    contentJson: null,
    jobId: null,
    userId: "user-1",
    consumedByTurnId: null,
    action: null,
    taskMessageId: "message-1",
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const context: TaskTurnContext = {
  ticket: { title: "Dark mode", description: "Users want it", externalTicketId: null, pullRequestUrl: null },
  documents: { research: "", plan: "" },
  since: null,
  earlier: { messages: [], openComments: [] },
  fresh: { messages: [], comments: [], edits: [], pullRequestComments: [] },
};

describe("SessionTurnContinuationService", () => {
  const sessions = { getById: jest.fn(), update: jest.fn() };
  const turns = {
    listUnconsumedUserTurns: jest.fn(),
    nextSequence: jest.fn(),
    create: jest.fn(),
    markConsumed: jest.fn(),
    update: jest.fn(),
  };
  const events = { getMaxSequence: jest.fn(), create: jest.fn() };
  const tickets = { getTicket: jest.fn() };
  const loader = { load: jest.fn() };
  const prompts = { build: jest.fn() };
  const dispatcher = { dispatch: jest.fn() };
  const service = new SessionTurnContinuationService(sessions, turns, events, {
    tickets,
    context: loader,
    prompts,
    dispatcher,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", projectId: "proj-1", title: "Dark mode" });
    turns.nextSequence.mockResolvedValue(7);
    turns.create.mockResolvedValue({ id: "a1" });
    events.getMaxSequence.mockResolvedValue(10);
    loader.load.mockResolvedValue(context);
    prompts.build.mockResolvedValue({ prompt: "delta", coldStartPrompt: "preamble\n\ndelta" });
    dispatcher.dispatch.mockImplementation(async (_input, onSubmitted) => {
      await onSubmitted({ id: "job-1", prompt: "delta" });
      return { id: "job-1", status: "pending" };
    });
  });

  it("returns null and launches nothing when no messages are pending", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([]);

    await expect(service.launchForPendingMessages(makeSession())).resolves.toBeNull();
    expect(turns.create).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("answers every pending message in one turn, doing what the latest specific ask wanted", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([
      makeUserTurn({ id: "u1", action: "research" }),
      makeUserTurn({ id: "u2", action: "plan" }),
      makeUserTurn({ id: "u3", action: "reply", taskMessageId: null }),
    ]);

    const result = await service.launchForPendingMessages(makeSession());

    expect(turns.create).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1", role: "assistant", sequence: 7, status: "queued", action: "plan" }),
    );
    expect(turns.markConsumed).toHaveBeenCalledWith(["u1", "u2", "u3"], "a1");
    // Only what was said in the live session is passed on; thread messages are read from the thread.
    expect(loader.load).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1", turnId: "a1", action: "plan", sessionMessages: [expect.objectContaining({ id: "u3" })] }),
    );
    expect(prompts.build).toHaveBeenCalledWith("proj-1", context, "plan", false);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "a1", action: "plan", allowCode: false, prompts: { prompt: "delta", coldStartPrompt: "preamble\n\ndelta" } }),
      expect.any(Function),
    );
    expect(result).toEqual({ currentTurn: { id: "a1" }, job: { id: "job-1", status: "pending" } });
  });

  it("knows its job and shows the prompt before the worker starts", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn()]);

    await service.launchForPendingMessages(makeSession());

    expect(turns.update).toHaveBeenCalledWith("a1", { jobId: "job-1" });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 11, eventType: "turn_started", payloadJson: { turnId: "a1", action: "reply", fullPrompt: "delta" } }),
    );
    expect(sessions.update).toHaveBeenCalledWith("sess-1", { status: "active", lastJobId: "job-1", lastTurnId: "a1" });
  });

  it("lets a turn write code only when someone asked to build it", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn({ action: "code" })]);

    await service.launchForPendingMessages(makeSession());

    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: "code", allowCode: true }), expect.any(Function));
  });

  it("clears the pending request pointer when requested", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn()]);

    await service.launchForPendingMessages(makeSession(), { clearPendingRequest: true });

    expect(sessions.update).toHaveBeenCalledWith("sess-1", expect.objectContaining({ latestPendingRequestId: null }));
  });

  it("marks the turn failed when its job can't start", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn()]);
    dispatcher.dispatch.mockRejectedValue(new Error("Selected clanker is inactive."));

    await expect(service.launchForPendingMessages(makeSession())).rejects.toThrow("Selected clanker is inactive.");
    expect(turns.update).toHaveBeenCalledWith("a1", expect.objectContaining({ status: "failed" }));
  });

  it("drain is a no-op when the session is not active", async () => {
    sessions.getById.mockResolvedValue(makeSession({ status: "waiting_on_user" }));

    await expect(service.drainQueuedMessages("sess-1")).resolves.toBe(false);
    expect(turns.listUnconsumedUserTurns).not.toHaveBeenCalled();
  });

  it("drain launches one turn for queued messages on active sessions", async () => {
    sessions.getById.mockResolvedValue(makeSession());
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn()]);

    await expect(service.drainQueuedMessages("sess-1")).resolves.toBe(true);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("drain reports no turn, rather than failing the turn that ended, when the next can't start", async () => {
    sessions.getById.mockResolvedValue(makeSession());
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn()]);
    dispatcher.dispatch.mockRejectedValue(new Error("No runner"));

    await expect(service.drainQueuedMessages("sess-1")).resolves.toBe(false);
  });
});
