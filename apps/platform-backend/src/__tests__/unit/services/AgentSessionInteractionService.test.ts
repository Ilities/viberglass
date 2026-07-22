const mockAgentSessionDAO = {
  getById: jest.fn(),
  update: jest.fn(),
};

const mockAgentTurnDAO = {
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  getInFlightAssistantTurn: jest.fn(),
};

const mockAgentSessionEventDAO = {
  getMaxSequence: jest.fn(),
  create: jest.fn(),
};

const mockAgentPendingRequestDAO = {
  getOpenBySession: jest.fn(),
  resolve: jest.fn(),
};

const mockTurnContinuationService = {
  launchForPendingMessages: jest.fn(),
};

jest.mock("../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockAgentSessionDAO),
}));
jest.mock("../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => mockAgentTurnDAO),
}));
jest.mock("../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => mockAgentSessionEventDAO),
}));
jest.mock("../../../persistence/agentSession/AgentPendingRequestDAO", () => ({
  AgentPendingRequestDAO: jest.fn(() => mockAgentPendingRequestDAO),
}));
jest.mock("../../../services/JobService", () => ({
  JobService: jest.fn(() => ({})),
}));
jest.mock("../../../services/CredentialRequirementsService", () => ({
  CredentialRequirementsService: jest.fn(() => ({})),
}));
jest.mock("../../../workers", () => ({
  WorkerExecutionService: jest.fn(() => ({})),
}));
jest.mock(
  "../../../services/agentSession/SessionTurnContinuationService",
  () => ({
    SessionTurnContinuationService: jest.fn(
      () => mockTurnContinuationService,
    ),
  }),
);

import { AgentSessionInteractionService } from "../../../services/agentSession/AgentSessionInteractionService";
import { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../../persistence/agentSession/AgentPendingRequestDAO";
import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import { JobService } from "../../../services/JobService";
import { CredentialRequirementsService } from "../../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../../workers";
import type { AgentSession } from "../../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn } from "../../../persistence/agentSession/AgentTurnDAO";

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "sess-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    projectSlug: null,
    ticketId: "ticket-1",
    ticketTitle: null,
    clankerId: "clanker-1",
    mode: "execution",
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

function makeTurn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn-1",
    sessionId: "sess-1",
    role: "assistant",
    status: "queued",
    sequence: 4,
    contentMarkdown: null,
    contentJson: null,
    jobId: "job-1",
    userId: null,
    consumedByTurnId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AgentSessionInteractionService", () => {
  let service: AgentSessionInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentSessionInteractionService(
      new AgentSessionDAO(),
      new AgentTurnDAO(),
      new AgentSessionEventDAO(),
      new AgentPendingRequestDAO(),
      new SessionTurnContinuationService(
        new AgentSessionDAO(),
        new AgentTurnDAO(),
        new AgentSessionEventDAO(),
        new JobService(),
        new CredentialRequirementsService(),
        new WorkerExecutionService(),
      ),
    );

    mockAgentSessionEventDAO.getMaxSequence.mockResolvedValue(10);
    mockAgentSessionEventDAO.create.mockResolvedValue({});
    mockAgentTurnDAO.create.mockResolvedValue(makeTurn());
  });

  describe("sendMessage", () => {
    it("queues the message without launching when a turn is in flight", async () => {
      const session = makeSession();
      mockAgentSessionDAO.getById.mockResolvedValue(session);
      const inFlight = makeTurn({ id: "a-inflight", jobId: "job-9" });
      mockAgentTurnDAO.getInFlightAssistantTurn.mockResolvedValue(inFlight);

      const result = await service.sendMessage(
        "sess-1",
        "ship it",
        "user-1",
        "Jussi",
      );

      expect(mockAgentTurnDAO.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          contentMarkdown: "[Jussi]: ship it",
          userId: "user-1",
        }),
      );
      expect(
        mockTurnContinuationService.launchForPendingMessages,
      ).not.toHaveBeenCalled();
      expect(result.currentTurn).toEqual(inFlight);
      expect(result.job).toEqual({ id: "job-9", status: "queued" });
    });

    it("launches a continuation when no turn is in flight", async () => {
      const session = makeSession();
      mockAgentSessionDAO.getById.mockResolvedValue(session);
      mockAgentTurnDAO.getInFlightAssistantTurn.mockResolvedValue(null);
      const launched = {
        currentTurn: makeTurn({ id: "a-new" }),
        job: { id: "job-2", status: "pending" },
      };
      mockTurnContinuationService.launchForPendingMessages.mockResolvedValue(
        launched,
      );

      const result = await service.sendMessage(
        "sess-1",
        "hello",
        "user-1",
        "Jussi",
      );

      expect(
        mockTurnContinuationService.launchForPendingMessages,
      ).toHaveBeenCalledWith(session, undefined);
      expect(result).toEqual(launched);
    });

    it("stores content without a prefix when no user name is provided", async () => {
      mockAgentSessionDAO.getById.mockResolvedValue(makeSession());
      mockAgentTurnDAO.getInFlightAssistantTurn.mockResolvedValue(null);
      mockTurnContinuationService.launchForPendingMessages.mockResolvedValue({
        currentTurn: makeTurn(),
        job: { id: "job-2", status: "pending" },
      });

      await service.sendMessage("sess-1", "hello");

      expect(mockAgentTurnDAO.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentMarkdown: "hello" }),
      );
    });

    it("rejects messages to terminal sessions", async () => {
      mockAgentSessionDAO.getById.mockResolvedValue(
        makeSession({ status: "completed" }),
      );

      await expect(
        service.sendMessage("sess-1", "hello", "user-1", "Jussi"),
      ).rejects.toThrow("cannot accept messages");
      expect(mockAgentTurnDAO.create).not.toHaveBeenCalled();
    });
  });

  describe("reply", () => {
    it("throws when the pending request was already resolved by another user", async () => {
      mockAgentSessionDAO.getById.mockResolvedValue(
        makeSession({ status: "waiting_on_user" }),
      );
      mockAgentPendingRequestDAO.getOpenBySession.mockResolvedValue({
        id: "pr-1",
        requestType: "input",
      });
      mockAgentPendingRequestDAO.resolve.mockResolvedValue(null);

      await expect(
        service.reply("sess-1", "my answer", "user-2"),
      ).rejects.toThrow("already resolved");
      expect(
        mockTurnContinuationService.launchForPendingMessages,
      ).not.toHaveBeenCalled();
    });

    it("resolves the request and launches a batched continuation", async () => {
      const session = makeSession({ status: "waiting_on_user" });
      mockAgentSessionDAO.getById.mockResolvedValue(session);
      mockAgentPendingRequestDAO.getOpenBySession.mockResolvedValue({
        id: "pr-1",
        requestType: "input",
      });
      mockAgentPendingRequestDAO.resolve.mockResolvedValue({ id: "pr-1" });
      const launched = {
        currentTurn: makeTurn({ id: "a-new" }),
        job: { id: "job-3", status: "pending" },
      };
      mockTurnContinuationService.launchForPendingMessages.mockResolvedValue(
        launched,
      );

      const result = await service.reply("sess-1", "my answer", "user-1");

      expect(mockAgentPendingRequestDAO.resolve).toHaveBeenCalledWith("pr-1", {
        responseJson: { replyText: "my answer" },
        resolvedBy: "user-1",
      });
      expect(
        mockTurnContinuationService.launchForPendingMessages,
      ).toHaveBeenCalledWith(session, { clearPendingRequest: true });
      expect(result).toEqual(launched);
    });
  });
});
