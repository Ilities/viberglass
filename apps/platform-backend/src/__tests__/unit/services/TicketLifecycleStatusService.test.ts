import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";

const mockTicketDAO = {
  getTicket: jest.fn(),
  updateTicket: jest.fn(),
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

  it("keeps a new ticket open while nothing runs", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.OPEN);
    expect(mockTicketDAO.updateTicket).not.toHaveBeenCalled();
  });

  it("marks the ticket in progress while a run is queued or active", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.PLANNING);
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_PROGRESS);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-1", {
      status: TICKET_STATUS.IN_PROGRESS,
    });
  });

  it("marks the ticket in review when the phase document waits on a human", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_PROGRESS);
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "Research notes",
      approvalState: "draft",
    });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_REVIEW);
    expect(mockTicketDAO.updateTicket).toHaveBeenCalledWith("ticket-1", {
      status: TICKET_STATUS.IN_REVIEW,
    });
  });

  it("stays in progress while a revision runs on an existing document", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_STATUS.IN_REVIEW);
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "Research notes",
      approvalState: "draft",
    });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_PROGRESS);
  });

  it("returns a later phase to open when its run ends without a document", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.PLANNING, TICKET_STATUS.IN_PROGRESS);
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "   ",
      approvalState: "draft",
    });

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.OPEN);
  });

  it("marks execution in review once it has a pull request, and open before", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.EXECUTION, TICKET_STATUS.IN_PROGRESS);
    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.OPEN);

    givenTicket(
      TICKET_WORKFLOW_PHASE.EXECUTION,
      TICKET_STATUS.IN_PROGRESS,
      "https://github.com/example/shop/pull/1",
    );
    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.IN_REVIEW);
  });

  it("preserves resolved tickets", async () => {
    givenTicket(TICKET_WORKFLOW_PHASE.EXECUTION, TICKET_STATUS.RESOLVED);
    mockTicketDAO.hasRunningJob.mockResolvedValue(true);

    await expect(service.synchronize("ticket-1")).resolves.toBe(TICKET_STATUS.RESOLVED);
    expect(mockTicketDAO.updateTicket).not.toHaveBeenCalled();
  });
});
