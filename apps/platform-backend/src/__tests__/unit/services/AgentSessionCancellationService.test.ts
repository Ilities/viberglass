import { AgentSessionCancellationService } from "../../../services/agentSession/AgentSessionCancellationService";
import type { AgentSession } from "../../../persistence/agentSession/AgentSessionDAO";

function session(overrides: Partial<AgentSession>): AgentSession {
  return {
    id: "sess-1",
    tenantId: "api-server",
    projectId: "p",
    projectSlug: null,
    ticketId: "t",
    ticketTitle: null,
    clankerId: "c",
    mode: "research",
    status: "active",
    title: null,
    repository: null,
    baseBranch: null,
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

describe("AgentSessionCancellationService", () => {
  const sessions = { getById: jest.fn(), update: jest.fn() };
  const turns = { update: jest.fn() };
  const events = { getMaxSequence: jest.fn().mockResolvedValue(10), create: jest.fn() };
  const jobStopper = { stopJob: jest.fn() };
  const service = new AgentSessionCancellationService(sessions, turns, events, jobStopper);

  beforeEach(() => jest.clearAllMocks());

  it("stops the running job before marking the session cancelled", async () => {
    sessions.getById.mockResolvedValue(session({ status: "active", lastJobId: "job-9", lastTurnId: "turn-9" }));

    await service.cancel("sess-1", "user-1");

    expect(jobStopper.stopJob).toHaveBeenCalledWith("job-9");
    expect(turns.update).toHaveBeenCalledWith("turn-9", { status: "cancelled" });
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ sequence: 11, eventType: "session_cancelled", payloadJson: { cancelledBy: "user-1" } }));
    expect(sessions.update).toHaveBeenCalledWith("sess-1", expect.objectContaining({ status: "cancelled" }));
    expect(jobStopper.stopJob.mock.invocationCallOrder[0]).toBeLessThan(sessions.update.mock.invocationCallOrder[0]);
  });

  it("does not try to stop a job when the session has none", async () => {
    sessions.getById.mockResolvedValue(session({ status: "waiting_on_user" }));

    await service.cancel("sess-1", "user-1");

    expect(jobStopper.stopJob).not.toHaveBeenCalled();
    expect(sessions.update).toHaveBeenCalled();
  });

  it("rejects cancelling a session that already ended", async () => {
    sessions.getById.mockResolvedValue(session({ status: "completed", lastJobId: "job-9" }));

    await expect(service.cancel("sess-1", "user-1")).rejects.toThrow("terminal state");
    expect(jobStopper.stopJob).not.toHaveBeenCalled();
  });
});
