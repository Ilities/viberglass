import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { TicketPhaseApprovalDAO } from "../../../persistence/ticketing/TicketPhaseApprovalDAO";
import { TicketPhaseRunDAO } from "../../../persistence/ticketing/TicketPhaseRunDAO";
import { TicketPlanningApprovalService } from "../../../services/TicketPlanningApprovalService";
import { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";
import { TicketWorkflowService } from "../../../services/TicketWorkflowService";

jest.mock("../../../persistence/ticketing/TicketDAO");
jest.mock("../../../persistence/ticketing/TicketPhaseApprovalDAO");
jest.mock("../../../persistence/ticketing/TicketPhaseRunDAO");
jest.mock("../../../services/TicketPhaseDocumentService");
jest.mock("../../../services/TicketWorkflowService");

describe("TicketPlanningApprovalService", () => {
  let service: TicketPlanningApprovalService;
  let mockTicketDAO: jest.Mocked<TicketDAO>;
  let mockApprovalDAO: jest.Mocked<TicketPhaseApprovalDAO>;
  let mockPhaseRunDAO: jest.Mocked<TicketPhaseRunDAO>;
  let mockDocumentService: jest.Mocked<TicketPhaseDocumentService>;
  let mockWorkflowService: jest.Mocked<TicketWorkflowService>;
  let mockFeedbackService: { postPlanningApproved: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;
    mockApprovalDAO =
      new TicketPhaseApprovalDAO() as jest.Mocked<TicketPhaseApprovalDAO>;
    mockPhaseRunDAO = new TicketPhaseRunDAO() as jest.Mocked<TicketPhaseRunDAO>;
    mockDocumentService =
      new TicketPhaseDocumentService() as jest.Mocked<TicketPhaseDocumentService>;
    mockWorkflowService =
      new TicketWorkflowService() as jest.Mocked<TicketWorkflowService>;
    mockFeedbackService = {
      postPlanningApproved: jest.fn().mockResolvedValue({ success: true }),
    };

    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);
    (TicketPhaseApprovalDAO as jest.Mock).mockImplementation(
      () => mockApprovalDAO,
    );
    (TicketPhaseRunDAO as jest.Mock).mockImplementation(() => mockPhaseRunDAO);
    (TicketPhaseDocumentService as jest.Mock).mockImplementation(
      () => mockDocumentService,
    );
    (TicketWorkflowService as jest.Mock).mockImplementation(
      () => mockWorkflowService,
    );

    mockPhaseRunDAO.getLatestRun.mockResolvedValue({
      id: "run-1",
      jobId: "job-1",
      status: "completed",
      clankerId: "clanker-1",
      clankerName: "Planner",
      clankerSlug: "planner",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      startedAt: new Date("2026-03-01T10:01:00.000Z"),
      finishedAt: new Date("2026-03-01T10:02:00.000Z"),
    } as any);

    service = new TicketPlanningApprovalService(mockFeedbackService as any);
  });

  it("approves planning, advances the workflow, and posts external feedback", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    } as any);
    mockDocumentService.approveDocument.mockResolvedValue({
      id: "planning-doc",
      ticketId: "ticket-1",
      phase: TICKET_WORKFLOW_PHASE.PLANNING,
      content: "Approved plan",
      approvalState: "approved",
      approvedAt: "2026-03-01T10:00:00.000Z",
      approvedBy: "approver@example.com",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    });
    mockWorkflowService.advancePhase.mockResolvedValue({
      ticketId: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
    });

    const result = await service.approve("ticket-1", "approver@example.com");

    expect(mockDocumentService.approveDocument).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
      "approver@example.com",
    );
    expect(mockApprovalDAO.recordApprovalAction).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
      "approved",
      "approver@example.com",
      "Planning document approved",
    );
    expect(mockWorkflowService.advancePhase).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );
    expect(mockFeedbackService.postPlanningApproved).toHaveBeenCalledWith({
      id: "ticket-1",
      ticketId: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    });
    expect(result.document.approvalState).toBe("approved");
    expect(result.latestRun?.jobId).toBe("job-1");
  });

  it("rejects approval when the ticket is not in planning", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-2",
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
    } as any);

    await expect(service.approve("ticket-2")).rejects.toThrow(
      "Approval can only be granted during the planning phase",
    );

    expect(mockDocumentService.approveDocument).not.toHaveBeenCalled();
    expect(mockWorkflowService.advancePhase).not.toHaveBeenCalled();
  });
});
