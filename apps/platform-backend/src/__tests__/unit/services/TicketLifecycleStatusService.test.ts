import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";

const mockTicketDAO = {
  getTicket: jest.fn(),
  updateTicket: jest.fn(),
  hasExecutionJob: jest.fn(),
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
    service = new TicketLifecycleStatusService();
  });

  it("marks research tickets in progress when the phase document has content", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      status: TICKET_STATUS.OPEN,
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
    });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "Research notes",
      approvalState: "draft",
    });

    const result = await service.synchronize("ticket-1");

    expect(result).toBe(TICKET_STATUS.IN_PROGRESS);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-1", {
      status: TICKET_STATUS.IN_PROGRESS,
    });
  });

  it("marks execution tickets in progress when they have an execution job", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-2",
      status: TICKET_STATUS.OPEN,
      workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
    });
    mockTicketDAO.hasExecutionJob.mockResolvedValue(true);

    const result = await service.synchronize("ticket-2");

    expect(result).toBe(TICKET_STATUS.IN_PROGRESS);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-2", {
      status: TICKET_STATUS.IN_PROGRESS,
    });
  });

  it("resets non-resolved tickets to open when the current phase has no progress signals", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-3",
      status: TICKET_STATUS.IN_PROGRESS,
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-3",
      content: "   ",
      approvalState: "draft",
    });

    const result = await service.synchronize("ticket-3");

    expect(result).toBe(TICKET_STATUS.OPEN);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-3", {
      status: TICKET_STATUS.OPEN,
    });
  });

  it("preserves resolved tickets", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-4",
      status: TICKET_STATUS.RESOLVED,
      workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
    });

    const result = await service.synchronize("ticket-4");

    expect(result).toBe(TICKET_STATUS.RESOLVED);
    expect(mockTicketDAO.updateTicket).not.toHaveBeenCalled();
  });
});
