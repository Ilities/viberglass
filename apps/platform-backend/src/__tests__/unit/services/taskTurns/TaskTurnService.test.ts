import type { AgentSession } from "../../../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn } from "../../../../persistence/agentSession/AgentTurnDAO";
import { TASK_ASK_POLICY_ERROR_CODE, TaskAskPolicyError } from "../../../../services/errors/TaskAskPolicyError";
import { TaskTurnService } from "../../../../services/taskTurns/TaskTurnService";

const TICKET = { id: "t-1", projectId: "p-1", title: "Dark mode", workflowPhase: "research" as const };

function session(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "s-1",
    tenantId: "api-server",
    projectId: "p-1",
    projectSlug: null,
    ticketId: "t-1",
    ticketTitle: null,
    clankerId: "claude",
    mode: "research",
    status: "waiting_on_user",
    title: "Dark mode",
    repository: null,
    baseBranch: null,
    workspaceBranch: null,
    draftPullRequestUrl: null,
    headCommitHash: null,
    lastJobId: null,
    lastTurnId: null,
    latestPendingRequestId: null,
    metadataJson: { acpSessionId: "acp-1" },
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function turn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn",
    sessionId: "s-1",
    role: "user",
    status: "completed",
    sequence: 3,
    contentMarkdown: null,
    contentJson: null,
    jobId: null,
    userId: null,
    consumedByTurnId: null,
    action: null,
    taskMessageId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const deps = {
    tickets: { getTicket: jest.fn().mockResolvedValue(TICKET) },
    policy: { assertCanAsk: jest.fn().mockResolvedValue(undefined) },
    discussion: { create: jest.fn().mockResolvedValue("message-1") },
    agents: { resolve: jest.fn().mockResolvedValue("claude") },
    sessions: {
      getOpenByTicketAndClanker: jest.fn().mockResolvedValue(session()),
      create: jest.fn().mockResolvedValue(session({ id: "s-new", metadataJson: null })),
      getById: jest.fn(async (id: string) => session({ id })),
    },
    turns: {
      nextSequence: jest.fn().mockResolvedValue(4),
      create: jest.fn().mockResolvedValue(turn({ id: "u-1" })),
      getInFlightAssistantTurn: jest.fn().mockResolvedValue(null),
    },
    events: { getMaxSequence: jest.fn().mockResolvedValue(9), create: jest.fn() },
    continuation: {
      launchForPendingMessages: jest.fn().mockResolvedValue({ currentTurn: turn({ id: "a-1", role: "assistant" }), job: { id: "job-1", status: "pending" } }),
    },
  };
  return { deps, service: new TaskTurnService(deps) };
}

describe("TaskTurnService", () => {
  it("posts the person's words in the thread and makes them the session's next turn", async () => {
    const { deps, service } = setup();

    const result = await service.ask("t-1", "maria", { message: "  @agent cover Safari  ", action: "research" });

    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "maria", "@agent cover Safari");
    expect(deps.turns.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s-1",
        role: "user",
        sequence: 4,
        contentMarkdown: "@agent cover Safari",
        userId: "maria",
        action: "research",
        taskMessageId: "message-1",
      }),
    );
    expect(deps.events.create).toHaveBeenCalledWith(expect.objectContaining({ sequence: 10, eventType: "user_message", userId: "maria" }));
    expect(deps.continuation.launchForPendingMessages).toHaveBeenCalledWith(expect.objectContaining({ id: "s-1", metadataJson: { acpSessionId: "acp-1" } }));
    expect(result).toEqual(expect.objectContaining({ job: { id: "job-1", status: "pending" }, messageId: "message-1" }));
    expect(deps.sessions.create).not.toHaveBeenCalled();
  });

  it("opens the agent's session on the task when it has none", async () => {
    const { deps, service } = setup();
    deps.sessions.getOpenByTicketAndClanker.mockResolvedValue(null);

    await service.ask("t-1", "maria", { message: "", action: "plan" });

    expect(deps.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "t-1", clankerId: "claude", mode: "planning", createdBy: "maria" }),
    );
    expect(deps.events.create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s-new", sequence: 1, eventType: "session_started" }));
    // A suggested action with nothing added posts its own words.
    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "maria", "Write the plan");
  });

  it("waits for the turn that's running rather than starting another", async () => {
    const { deps, service } = setup();
    deps.turns.getInFlightAssistantTurn.mockResolvedValue(turn({ id: "a-running", role: "assistant", jobId: "job-0" }));

    const result = await service.ask("t-1", "maria", { message: "and mobile?" });

    expect(deps.turns.create).toHaveBeenCalled();
    expect(deps.continuation.launchForPendingMessages).not.toHaveBeenCalled();
    expect(result.job).toEqual({ id: "job-0", status: "queued" });
    expect(result.currentTurn.id).toBe("a-running");
  });

  it("builds with no plan approved: asking is the agreement", async () => {
    const { deps, service } = setup();

    await service.ask("t-1", "maria", { message: "", action: "code" });

    expect(deps.policy.assertCanAsk).toHaveBeenCalledWith("maria", "t-1", "code");
    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "maria", "Build it");
    expect(deps.continuation.launchForPendingMessages).toHaveBeenCalled();
  });

  it("refuses an ask the policy refuses, before posting anything", async () => {
    const { deps, service } = setup();
    deps.policy.assertCanAsk.mockRejectedValue(new TaskAskPolicyError(TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED, "Only the task's people…"));

    await expect(service.ask("t-1", "visitor", { message: "", action: "code" })).rejects.toMatchObject({ code: "ASK_NOT_ALLOWED" });
    expect(deps.discussion.create).not.toHaveBeenCalled();
    expect(deps.turns.create).not.toHaveBeenCalled();
  });

  it("asks for nothing when there are no words and no action", async () => {
    const { deps, service } = setup();

    await expect(service.ask("t-1", "maria", { message: "   " })).rejects.toMatchObject({ code: "NOTHING_ASKED" });
    expect(deps.discussion.create).not.toHaveBeenCalled();
  });

  it("starts a turn nobody asked for in the thread, from Slack without a linked account", async () => {
    const { deps, service } = setup();

    const result = await service.ask("t-1", null, { message: "", action: "research", agentId: "codex" });

    expect(deps.agents.resolve).toHaveBeenCalledWith("t-1", { agentId: "codex", message: "Write the research" });
    expect(deps.discussion.create).not.toHaveBeenCalled();
    expect(deps.turns.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null, taskMessageId: null, action: "research" }));
    expect(result.messageId).toBeNull();
  });

  it("says the task isn't there", async () => {
    const { deps, service } = setup();
    deps.tickets.getTicket.mockResolvedValue(null);

    await expect(service.ask("t-x", "maria", { message: "hi" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });
  });
});
