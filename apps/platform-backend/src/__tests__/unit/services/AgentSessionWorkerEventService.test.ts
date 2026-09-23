const mockAgentSessionEventDAO = {
  getMaxSequence: jest.fn(),
  createMany: jest.fn(),
};
const mockAgentTurnDAO = {
  getByJobId: jest.fn(),
  update: jest.fn(),
  listUnconsumedUserTurns: jest.fn(),
};
const mockAgentSessionDAO = {
  getById: jest.fn(),
  update: jest.fn(),
};
const mockAgentPendingRequestDAO = {
  getOpenBySession: jest.fn(),
  create: jest.fn(),
};
const mockTurnContinuationService = {
  drainQueuedMessages: jest.fn(),
};

jest.mock("../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => mockAgentSessionEventDAO),
}));
jest.mock("../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => mockAgentTurnDAO),
}));
jest.mock("../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockAgentSessionDAO),
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
jest.mock("../../../services/agentSession/SessionTurnContinuationService", () => ({
  SessionTurnContinuationService: jest.fn(() => mockTurnContinuationService),
}));

import { AgentSessionEventDAO } from "../../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import { AgentPendingRequestDAO } from "../../../persistence/agentSession/AgentPendingRequestDAO";
import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import { JobService } from "../../../services/JobService";
import { CredentialRequirementsService } from "../../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../../workers";
import { AgentSessionWorkerEventService } from "../../../services/agentSession/AgentSessionWorkerEventService";

const DOCUMENT_SAVED_EVENTS = [
  { eventType: "turn_completed" as const, payload: {} },
  { eventType: "session_completed" as const, payload: { documentSaved: true } },
];

function createService(): AgentSessionWorkerEventService {
  return new AgentSessionWorkerEventService(
    new AgentSessionEventDAO(),
    new AgentTurnDAO(),
    new AgentSessionDAO(),
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
}

function recordedEventTypes(): string[] {
  const [inputs] = mockAgentSessionEventDAO.createMany.mock.calls[0];
  return inputs.map((input: { eventType: string }) => input.eventType);
}

describe("AgentSessionWorkerEventService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentTurnDAO.getByJobId.mockResolvedValue({ id: "turn-2", sessionId: "sess-1" });
    mockAgentSessionEventDAO.getMaxSequence.mockResolvedValue(10);
  });

  it("completes the session when nobody is waiting on the agent", async () => {
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue([]);

    await createService().batchIngest("job-1", DOCUMENT_SAVED_EVENTS);

    expect(recordedEventTypes()).toEqual(["turn_completed", "session_completed"]);
    expect(mockAgentSessionDAO.update).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("keeps the session open and drains messages queued during the turn", async () => {
    mockAgentTurnDAO.listUnconsumedUserTurns.mockResolvedValue([
      { id: "turn-3", contentMarkdown: "[Maria PM]: keep dark as the default" },
    ]);

    await createService().batchIngest("job-1", DOCUMENT_SAVED_EVENTS);

    expect(recordedEventTypes()).toEqual(["turn_completed"]);
    expect(mockAgentSessionDAO.update).not.toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ status: "completed" }),
    );
    expect(mockTurnContinuationService.drainQueuedMessages).toHaveBeenCalledWith("sess-1");
  });

  it("does not look for queued messages when the turn does not complete the session", async () => {
    await createService().batchIngest("job-1", [{ eventType: "turn_completed", payload: {} }]);

    expect(mockAgentTurnDAO.listUnconsumedUserTurns).not.toHaveBeenCalled();
    expect(mockTurnContinuationService.drainQueuedMessages).toHaveBeenCalledWith("sess-1");
  });
});
