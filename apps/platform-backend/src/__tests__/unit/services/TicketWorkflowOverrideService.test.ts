import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { TicketWorkflowOverrideService } from "../../../services/TicketWorkflowOverrideService";

jest.mock("../../../persistence/ticketing/TicketDAO");

const mockLifecycleStatusService = {
  synchronize: jest.fn(),
};

jest.mock("../../../services/TicketLifecycleStatusService", () => ({
  TicketLifecycleStatusService: jest.fn(() => mockLifecycleStatusService),
}));

describe("TicketWorkflowOverrideService", () => {
  let service: TicketWorkflowOverrideService;
  let mockTicketDAO: jest.Mocked<TicketDAO>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;
    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);
    service = new TicketWorkflowOverrideService();
  });

  it("records an execution override and returns the updated ticket", async () => {
    mockTicketDAO.getTicket
      .mockResolvedValueOnce({
        id: "ticket-1",
        workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
      } as any)
      .mockResolvedValueOnce({
        id: "ticket-1",
        workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
        workflowOverrideReason: "Urgent production fix",
        workflowOverriddenAt: "2026-03-01T12:00:00.000Z",
        workflowOverriddenBy: "approver@example.com",
      } as any);

    const result = await service.overrideToExecution(
      "ticket-1",
      "Urgent production fix",
      "approver@example.com",
    );

    expect(mockTicketDAO.overrideWorkflowToExecution).toHaveBeenCalledWith(
      "ticket-1",
      "Urgent production fix",
      "approver@example.com",
    );
    expect(result.workflowPhase).toBe(TICKET_WORKFLOW_PHASE.EXECUTION);
    expect(result.workflowOverrideReason).toBe("Urgent production fix");
  });

  it("requires a non-empty reason", async () => {
    await expect(service.overrideToExecution("ticket-1", "   ")).rejects.toThrow(
      "workflow override reason is required",
    );

    expect(mockTicketDAO.getTicket).not.toHaveBeenCalled();
  });

  it("rejects duplicate overrides", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
      workflowOverriddenAt: "2026-03-01T12:00:00.000Z",
    } as any);

    await expect(
      service.overrideToExecution("ticket-1", "Urgent production fix"),
    ).rejects.toThrow("Ticket workflow has already been overridden");
  });
});
