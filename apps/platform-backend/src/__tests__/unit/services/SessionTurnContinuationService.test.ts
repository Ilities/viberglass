const mockAgentTurnDAO = {
  listUnconsumedUserTurns: jest.fn(),
  markConsumed: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockAgentSessionEventDAO = {
  getMaxSequence: jest.fn(),
  create: jest.fn(),
};

const mockAgentSessionDAO = {
  getById: jest.fn(),
  update: jest.fn(),
};

const mockJobService = {
  submitJob: jest.fn(),
  saveBootstrapPayload: jest.fn(),
};

const mockCredentialRequirementsService = {
  getRequiredCredentialsForClanker: jest.fn(),
};

const mockWorkerExecutionService = {
  executeJob: jest.fn(),
};

const mockRender = jest.fn();
const mockPrepareTicketRunContext = jest.fn();

jest.mock("../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockAgentSessionDAO),
}));
jest.mock("../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => mockAgentTurnDAO),
}));
jest.mock("../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => mockAgentSessionEventDAO),
}));
jest.mock("../../../services/JobService", () => ({
  JobService: jest.fn(() => mockJobService),
}));
jest.mock("../../../services/CredentialRequirementsService", () => ({
  CredentialRequirementsService: jest.fn(
    () => mockCredentialRequirementsService,
  ),
}));
jest.mock("../../../workers", () => ({
  WorkerExecutionService: jest.fn(() => mockWorkerExecutionService),
}));
jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => ({ getTicket: jest.fn().mockResolvedValue(null) })),
}));
jest.mock("../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => ({})),
}));
jest.mock("../../../persistence/project/ProjectScmConfigDAO", () => ({
  ProjectScmConfigDAO: jest.fn(() => ({})),
}));
jest.mock("../../../persistence/integrations", () => ({
  IntegrationCredentialDAO: jest.fn(() => ({})),
}));
jest.mock("../../../services/SecretService", () => ({
  SecretService: jest.fn(() => ({})),
}));
jest.mock("../../../persistence/clanker/ClankerDAO", () => ({
  ClankerDAO: jest.fn(() => ({})),
}));
jest.mock("../../../provisioning/provisioningFactory", () => ({
  getClankerProvisioner: () => ({}),
}));
jest.mock("../../../services/instructions/InstructionStorageService", () => ({
  InstructionStorageService: jest.fn(() => ({})),
}));
jest.mock("../../../services/TicketPhaseDocumentService", () => ({
  TicketPhaseDocumentService: jest.fn(() => ({})),
}));
jest.mock(
  "../../../persistence/ticketing/TicketPhaseDocumentCommentDAO",
  () => ({
    TicketPhaseDocumentCommentDAO: jest.fn(() => ({})),
    PHASE_DOCUMENT_COMMENT_STATUS: { OPEN: "open" },
  }),
);
jest.mock("../../../services/PromptTemplateService", () => ({
  PromptTemplateService: jest.fn(() => ({ render: mockRender })),
}));
jest.mock("../../../persistence/promptTemplate/PromptTemplateDAO", () => {
  const actual = jest.requireActual(
    "../../../persistence/promptTemplate/PromptTemplateDAO",
  );
  return { ...actual, PromptTemplateDAO: jest.fn(() => ({})) };
});
jest.mock("../../../services/ticketRunOrchestration", () => ({
  prepareTicketRunContext: (...args: unknown[]) =>
    mockPrepareTicketRunContext(...args),
  buildBootstrapPayload: () => ({ base: true }),
}));

import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../../persistence/agentSession/AgentSessionEventDAO";
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

function makeUserTurn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn-u1",
    sessionId: "sess-1",
    role: "user",
    status: "completed",
    sequence: 5,
    contentMarkdown: "[Jussi]: do X",
    contentJson: null,
    jobId: null,
    userId: "user-1",
    consumedByTurnId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const preparedStub = {
  executionClanker: { agent: "pi" },
  workerType: "docker",
  sourceRepository: "org/repo",
  baseBranch: "main",
  workerInstructionFiles: [],
  mergedInstructionFiles: [],
  project: { id: "proj-1" },
};

describe("SessionTurnContinuationService", () => {
  let service: SessionTurnContinuationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionTurnContinuationService(
      new AgentSessionDAO(),
      new AgentTurnDAO(),
      new AgentSessionEventDAO(),
      new JobService(),
      new CredentialRequirementsService(),
      new WorkerExecutionService(),
    );

    mockPrepareTicketRunContext.mockResolvedValue(preparedStub);
    mockRender.mockResolvedValue("enriched-task");
    mockJobService.submitJob.mockResolvedValue({ callbackToken: "token-1" });
    mockJobService.saveBootstrapPayload.mockResolvedValue(undefined);
    mockCredentialRequirementsService.getRequiredCredentialsForClanker.mockResolvedValue(
      [],
    );
    mockWorkerExecutionService.executeJob.mockResolvedValue({
      executionId: "exec-1",
    });
    mockAgentTurnDAO.update.mockResolvedValue(undefined);
    mockAgentSessionEventDAO.create.mockResolvedValue({});
  });

  it("returns null and launches nothing when no messages are pending", async () => {
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue([]);

    const result = await service.launchForPendingMessages(makeSession());

    expect(result).toBeNull();
    expect(mockAgentTurnDAO.create).not.toHaveBeenCalled();
    expect(mockJobService.submitJob).not.toHaveBeenCalled();
  });

  it("batches all pending user turns into a single continuation turn", async () => {
    const pending = [
      makeUserTurn({ id: "u1", sequence: 5, contentMarkdown: "[Jussi]: do X" }),
      makeUserTurn({ id: "u2", sequence: 6, contentMarkdown: "[Anna]: do Y" }),
    ];
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue(pending);
    mockAgentSessionEventDAO.getMaxSequence.mockResolvedValue(10);
    const assistantTurn = { id: "a1" };
    mockAgentTurnDAO.create.mockResolvedValue(assistantTurn);
    mockAgentTurnDAO.markConsumed.mockResolvedValue(undefined);

    const result = await service.launchForPendingMessages(makeSession());

    expect(mockAgentTurnDAO.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        role: "assistant",
        sequence: 7,
        status: "queued",
      }),
    );
    expect(mockAgentSessionEventDAO.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        sequence: 11,
        eventType: "turn_started",
      }),
    );
    expect(mockAgentTurnDAO.markConsumed).toHaveBeenCalledWith(
      ["u1", "u2"],
      "a1",
    );
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      "proj-1",
      expect.objectContaining({
        initialMessage: "[Jussi]: do X\n\n[Anna]: do Y",
      }),
    );
    expect(mockJobService.submitJob).toHaveBeenCalledTimes(1);
    expect(mockWorkerExecutionService.executeJob).toHaveBeenCalledTimes(1);
    expect(mockAgentSessionDAO.update).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({
        status: "active",
        lastTurnId: "a1",
      }),
    );
    expect(result?.currentTurn).toEqual(assistantTurn);
    expect(result?.job.status).toBe("pending");
  });

  it("clears the pending request pointer when requested", async () => {
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue([
      makeUserTurn(),
    ]);
    mockAgentSessionEventDAO.getMaxSequence.mockResolvedValue(10);
    mockAgentTurnDAO.create.mockResolvedValue({ id: "a1" });
    mockAgentTurnDAO.markConsumed.mockResolvedValue(undefined);

    await service.launchForPendingMessages(makeSession(), {
      clearPendingRequest: true,
    });

    expect(mockAgentSessionDAO.update).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ latestPendingRequestId: null }),
    );
  });

  it("drain is a no-op when the session is not active", async () => {
    mockAgentSessionDAO.getById.mockResolvedValue(
      makeSession({ status: "waiting_on_user" }),
    );

    await service.drainQueuedMessages("sess-1");

    expect(mockAgentTurnDAO.listUnconsumedUserTurns).not.toHaveBeenCalled();
    expect(mockJobService.submitJob).not.toHaveBeenCalled();
  });

  it("drain launches a batched continuation for queued messages on active sessions", async () => {
    mockAgentSessionDAO.getById.mockResolvedValue(makeSession());
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue([
      makeUserTurn(),
    ]);
    mockAgentSessionEventDAO.getMaxSequence.mockResolvedValue(10);
    mockAgentTurnDAO.create.mockResolvedValue({ id: "a1" });
    mockAgentTurnDAO.markConsumed.mockResolvedValue(undefined);

    await service.drainQueuedMessages("sess-1");

    expect(mockJobService.submitJob).toHaveBeenCalledTimes(1);
  });
});
