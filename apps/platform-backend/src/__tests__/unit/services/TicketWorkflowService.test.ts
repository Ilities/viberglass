import { TicketWorkflowService } from "../../../services/TicketWorkflowService";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";

jest.mock("../../../persistence/ticketing/TicketDAO");

const mockLifecycleStatusService = {
  synchronize: jest.fn(),
};

jest.mock("../../../services/TicketLifecycleStatusService", () => ({
  TicketLifecycleStatusService: jest.fn(() => mockLifecycleStatusService),
}));

describe("TicketWorkflowService", () => {
  let service: TicketWorkflowService;
  let mockTicketDAO: jest.Mocked<TicketDAO>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;
    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);
    service = new TicketWorkflowService();
  });

  it("returns the current ticket workflow state", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
    } as any);

    const result = await service.getTicketWorkflow("ticket-1");

    expect(result).toEqual({
      ticketId: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
      phases: [
        { phase: TICKET_WORKFLOW_PHASE.RESEARCH, status: "current" },
        { phase: TICKET_WORKFLOW_PHASE.PLANNING, status: "upcoming" },
        { phase: TICKET_WORKFLOW_PHASE.EXECUTION, status: "upcoming" },
      ],
    });
  });

  it("allows advancing from research to planning", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
    } as any);
    mockTicketDAO.updateWorkflowPhase.mockResolvedValue();

    const result = await service.advancePhase(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    expect(result).toEqual({
      ticketId: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    });
    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    expect(mockLifecycleStatusService.synchronize).toHaveBeenCalledWith(
      "ticket-1",
    );
  });

  it("allows advancing from planning to execution", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    } as any);
    mockTicketDAO.updateWorkflowPhase.mockResolvedValue();

    const result = await service.advancePhase(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );

    expect(result.workflowPhase).toBe(TICKET_WORKFLOW_PHASE.EXECUTION);
    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );
  });

  it("manually sets the workflow phase", async () => {
    mockTicketDAO.getTicket
      .mockResolvedValueOnce({
        id: "ticket-1",
        workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
      } as any)
      .mockResolvedValueOnce({
        id: "ticket-1",
        workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
      } as any);
    mockTicketDAO.updateWorkflowPhase.mockResolvedValue();

    const result = await service.setPhase(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );

    expect(mockTicketDAO.updateWorkflowPhase).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );
    expect(mockLifecycleStatusService.synchronize).toHaveBeenCalledWith(
      "ticket-1",
    );
    expect(result.workflowPhase).toBe(TICKET_WORKFLOW_PHASE.EXECUTION);
  });

  it("rejects research to execution transitions", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
    } as any);

    await expect(
      service.advancePhase("ticket-1", TICKET_WORKFLOW_PHASE.EXECUTION),
    ).rejects.toThrow(
      "Cannot advance ticket workflow from research to execution",
    );
    expect(mockTicketDAO.updateWorkflowPhase).not.toHaveBeenCalled();
  });

  it("rejects backward transitions", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    } as any);

    await expect(
      service.advancePhase("ticket-1", TICKET_WORKFLOW_PHASE.RESEARCH),
    ).rejects.toThrow(
      "Cannot advance ticket workflow from planning to research",
    );
  });

  it("rejects same-phase transitions", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
    } as any);

    await expect(
      service.advancePhase("ticket-1", TICKET_WORKFLOW_PHASE.EXECUTION),
    ).rejects.toThrow(
      "Cannot advance ticket workflow from execution to execution",
    );
  });

  it("throws when the ticket is missing", async () => {
    mockTicketDAO.getTicket.mockResolvedValue(null);

    await expect(service.getTicketWorkflow("missing")).rejects.toThrow(
      "Ticket not found",
    );
  });
});
