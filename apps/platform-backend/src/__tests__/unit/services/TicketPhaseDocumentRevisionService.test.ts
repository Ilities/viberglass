import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";

const mockTicketDAO = {
  getTicket: jest.fn(),
};

const mockRevisionDAO = {
  listByTicketAndPhase: jest.fn(),
};

jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentRevisionDAO", () => ({
  TicketPhaseDocumentRevisionDAO: jest.fn(() => mockRevisionDAO),
}));

import { TicketPhaseDocumentRevisionService } from "../../../services/TicketPhaseDocumentRevisionService";

describe("TicketPhaseDocumentRevisionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketDAO.getTicket.mockReset();
    mockRevisionDAO.listByTicketAndPhase.mockReset();
  });

  it("lists revision history for an existing ticket", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockRevisionDAO.listByTicketAndPhase.mockResolvedValue([
      {
        id: "revision-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: TICKET_WORKFLOW_PHASE.RESEARCH,
        content: "Initial draft",
        source: "manual",
        actor: "author@example.com",
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
      },
    ]);

    const service = new TicketPhaseDocumentRevisionService();
    const revisions = await service.listRevisions(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );

    expect(mockRevisionDAO.listByTicketAndPhase).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );
    expect(revisions).toEqual([
      {
        id: "revision-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: TICKET_WORKFLOW_PHASE.RESEARCH,
        content: "Initial draft",
        source: "manual",
        actor: "author@example.com",
        createdAt: "2026-03-01T09:00:00.000Z",
      },
    ]);
  });

  it("rejects listing revisions for a missing ticket", async () => {
    mockTicketDAO.getTicket.mockResolvedValue(null);

    const service = new TicketPhaseDocumentRevisionService();

    await expect(
      service.listRevisions("missing-ticket", TICKET_WORKFLOW_PHASE.PLANNING),
    ).rejects.toThrow("Ticket not found");
  });
});
