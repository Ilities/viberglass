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
    mode: "planning",
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
    buildParts: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const context: TaskTurnContext = {
  ticket: { title: "Dark mode", description: "Users want it", externalTicketId: null, pullRequestUrl: null },
  documents: { plan: "" },
  parts: { building: null, adding: null, addedTo: null, built: null },
  people: [],
  lastAgentCommit: null,
  summary: "",
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
  const projects = { getProject: jest.fn() };
  const artifacts = { listForTicket: jest.fn() };
  const messages = { imagesOf: jest.fn() };
  const service = new SessionTurnContinuationService(sessions, turns, events, {
    tickets,
    context: loader,
    prompts,
    dispatcher,
    projects,
    artifacts,
    messages,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", projectId: "proj-1", title: "Dark mode" });
    projects.getProject.mockResolvedValue({ id: "proj-1", backingKind: "git" });
    artifacts.listForTicket.mockResolvedValue([]);
    messages.imagesOf.mockResolvedValue(new Map());
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
      makeUserTurn({ id: "u1", action: "summarise" }),
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
    expect(prompts.build).toHaveBeenCalledWith("proj-1", context, "plan", false, false, []);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "a1", action: "plan", allowCode: false, prompts: { prompt: "delta", coldStartPrompt: "preamble\n\ndelta" } }),
      expect.any(Function),
    );
    expect(result).toEqual({ currentTurn: { id: "a1" }, job: { id: "job-1", status: "pending" } });
  });

  it("gives the turn the images attached to the messages it answers", async () => {
    const image = (id: string) => ({ id, filename: `${id}.png`, mimeType: "image/png", size: 3, url: id, storageUrl: id, uploadedAt: "2026-10-21T10:00:00.000Z" });
    turns.listUnconsumedUserTurns.mockResolvedValue([
      makeUserTurn({ id: "u1", taskMessageId: "message-1" }),
      makeUserTurn({ id: "u2", taskMessageId: null }),
      makeUserTurn({ id: "u3", taskMessageId: "message-3" }),
    ]);
    messages.imagesOf.mockResolvedValue(new Map([["message-1", [image("a")]], ["message-3", [image("b"), image("c")]]]));

    await service.launchForPendingMessages(makeSession());

    expect(messages.imagesOf).toHaveBeenCalledWith(["message-1", "message-3"]);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ messageImages: [image("a"), image("b"), image("c")] }),
      expect.any(Function),
    );
  });

  it("tells the prompt when the agent works in a Files space's files", async () => {
    projects.getProject.mockResolvedValue({ id: "proj-1", backingKind: "files" });
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn({ id: "u1", action: "reply" })]);

    await service.launchForPendingMessages(makeSession());

    expect(prompts.build).toHaveBeenCalledWith("proj-1", context, "reply", false, true, []);
  });

  it("gives an artifact ask the task's artifacts to revise", async () => {
    projects.getProject.mockResolvedValue({ id: "proj-1", backingKind: "files" });
    const existing = [{ id: "a-1", title: "Q4 deck", entrypoint: "deck/index.html" }];
    artifacts.listForTicket.mockResolvedValue(existing);
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn({ id: "u1", action: "code" })]);

    await service.launchForPendingMessages(makeSession());

    expect(artifacts.listForTicket).toHaveBeenCalledWith("ticket-1");
    expect(prompts.build).toHaveBeenCalledWith("proj-1", context, "code", true, true, existing);
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

  it("builds the parts the latest build ask named, on the turn, its context and its job", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([
      makeUserTurn({ id: "u1", action: "code", buildParts: { first: 1, last: 1 } }),
      makeUserTurn({ id: "u2", action: "code", buildParts: { first: 2, last: 2 } }),
      makeUserTurn({ id: "u3", action: "reply", buildParts: null }),
    ]);

    await service.launchForPendingMessages(makeSession());

    expect(turns.create).toHaveBeenCalledWith(expect.objectContaining({ action: "code", buildParts: { first: 2, last: 2 } }));
    expect(loader.load).toHaveBeenCalledWith(expect.objectContaining({ buildParts: { first: 2, last: 2 } }));
    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ buildParts: { first: 2, last: 2 } }), expect.any(Function));
  });

  it("builds no parts for a turn that isn't a build", async () => {
    turns.listUnconsumedUserTurns.mockResolvedValue([makeUserTurn({ action: "plan", buildParts: { first: 2, last: 2 } })]);

    await service.launchForPendingMessages(makeSession());

    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ buildParts: null }), expect.any(Function));
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
