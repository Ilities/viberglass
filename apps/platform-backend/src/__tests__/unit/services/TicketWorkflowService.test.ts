import { TicketWorkflowService } from "../../../services/TicketWorkflowService";
import { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";

jest.mock("../../../persistence/ticketing/TicketDAO");

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

  it("marks the steps before the current one completed", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
    } as any);

    const result = await service.getTicketWorkflow("ticket-1");

    expect(result.phases.map((phase) => phase.status)).toEqual(["completed", "current", "upcoming"]);
  });
});
