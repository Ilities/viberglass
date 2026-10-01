import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";

const mockTicketDAO = {
  getTicket: jest.fn(),
  updateTicket: jest.fn(),
  updateWorkflowPhase: jest.fn(),
  hasRunningJob: jest.fn(),
};

const mockDocumentDAO = {
  getByTicketAndPhase: jest.fn(),
};

jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentDAO", () => ({
  TicketPhaseDocumentDAO: jest.fn(() => mockDocumentDAO),
}));

import { TicketLifecycleStatusService } from "../../../services/TicketLifecycleStatusService";

describe("TicketLifecycleStatusService", () => {
  let service: TicketLifecycleStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketDAO.hasRunningJob.mockResolvedValue(false);
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue(null);
    service = new TicketLifecycleStatusService();
  });

  function givenTicket(
    workflowPhase: string,
    status: string = TICKET_STATUS.OPEN,
    pullRequestUrl?: string,
  ) {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      status,
      workflowPhase,
      pullRequestUrl,
    });
  }

  function givenDocuments(documents: Partial<Record<"research" | "planning", string>>) {
    mockDocumentDAO.getByTicketAndPhase.mockImplementation(async (_ticketId: string, phase: "research" | "planning") =>
      documents[phase] === undefined ? null : { id: `doc-${phase}`, content: documents[phase] },
    );
  }

  it("keeps a new ticket open while nothing runs", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.OPEN);
    expect(mockTicketDAO.updateTicket).not.toHaveBeenCalled();
    expect(mockTicketDAO.updateWorkflowPhase).not.toHaveBeenCalled();
  });

  it("marks the ticket in progress while a run is queued or active", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH);
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_PROGRESS);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-1", {
      status: TICKET_STATUS.IN_PROGRESS,
    });
  });

  it("marks the ticket in review while an artifact waits on people", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_PROGRESS);
    givenDocuments({ research: "Research notes" });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_REVIEW);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-1", {
      status: TICKET_STATUS.IN_REVIEW,
    });
  });

  it("stays in progress while a revision runs on an existing document", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_REVIEW);
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);
    givenDocuments({ research: "Research notes" });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_PROGRESS);
  });

  it("returns to open when a run ends with nothing written", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_PROGRESS);
    givenDocuments({ research: "   ", planning: "" });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.OPEN);
  });

  it("moves the phase to the plan once one is written, with nothing approved", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_PROGRESS);
    givenDocuments({ research: "Research notes", planning: "1. Do it" });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_REVIEW);
    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith("ticket-1", TICKET_WORKFLOW_PHASE.PLANNING);
  });

  it("moves the phase to the build once there's a pull request, plan or not", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_PROGRESS, "https://github.com/example/shop/pull/1");

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_REVIEW);
    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith("ticket-1", TICKET_WORKFLOW_PHASE.EXECUTION);
  });

  it("moves the phase back when a plan is emptied", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.PLANNING);
    givenDocuments({ research: "Research notes", planning: "" });

    await service.synchronize("ticket-1");
    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith("ticket-1", TICKET_WORKFLOW_PHASE.RESEARCH);
  });

  it("preserves resolved tickets", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.EXECUTION, TICKET_STATUS.RESOLVED, "https://github.com/example/shop/pull/1");
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.RESOLVED);
    expect(mockTicketDAO.updateTicket).not.toHaveBeenCalled();
  });
});
