import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";

const mockTicketDAO = {
  getTicket: jest.fn(),
};

const mockDocumentDAO = {
  getByTicketAndPhase: jest.fn(),
  create: jest.fn(),
  updateContent: jest.fn(),
  updateApprovalState: jest.fn(),
};

const mockRevisionDAO = {
  create: jest.fn(),
};

const mockLifecycleStatusService = {
  synchronize: jest.fn(),
};

jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentDAO", () => ({
  TicketPhaseDocumentDAO: jest.fn(() => mockDocumentDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentRevisionDAO", () => ({
  PHASE_DOCUMENT_REVISION_SOURCE: {
    MANUAL: "manual",
    AGENT: "agent",
  },
  TicketPhaseDocumentRevisionDAO: jest.fn(() => mockRevisionDAO),
}));

jest.mock("../../../services/TicketLifecycleStatusService", () => ({
  TicketLifecycleStatusService: jest.fn(() => mockLifecycleStatusService),
}));

import { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";

describe("TicketPhaseDocumentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketDAO.getTicket.mockReset();
    mockDocumentDAO.getByTicketAndPhase.mockReset();
    mockDocumentDAO.create.mockReset();
    mockDocumentDAO.updateContent.mockReset();
    mockDocumentDAO.updateApprovalState.mockReset();
    mockRevisionDAO.create.mockReset();
    mockLifecycleStatusService.synchronize.mockReset();
    delete process.env.AWS_S3_BUCKET;
  });

  it("creates a revision for every manual save", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase
      .mockResolvedValueOnce({
        id: "doc-1",
        ticketId: "ticket-1",
        phase: TICKET_WORKFLOW_PHASE.RESEARCH,
        content: "Old content",
        storageUrl: null,
        approvalState: "draft",
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
        updatedAt: new Date("2026-03-01T09:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "doc-1",
        ticketId: "ticket-1",
        phase: TICKET_WORKFLOW_PHASE.RESEARCH,
        content: "New content",
        storageUrl: null,
        approvalState: "draft",
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
        updatedAt: new Date("2026-03-01T10:00:00.000Z"),
      });
    mockDocumentDAO.updateContent.mockResolvedValue(undefined);
    mockRevisionDAO.create.mockResolvedValue({
      id: "revision-1",
    });

    const service = new TicketPhaseDocumentService();
    const result = await service.saveDocument(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.RESEARCH,
      "New content",
      { actor: "author@example.com" },
    );

    expect(mockDocumentDAO.updateContent).toHaveBeenCalledWith(
      "doc-1",
      "New content",
      null,
    );
    expect(mockRevisionDAO.create).toHaveBeenCalledWith({
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: TICKET_WORKFLOW_PHASE.RESEARCH,
      content: "New content",
      source: "manual",
      actor: "author@example.com",
    });
    expect(mockLifecycleStatusService.synchronize).toHaveBeenCalledWith(
      "ticket-1",
    );
    expect(result.content).toBe("New content");
  });

  it("creates a document before saving when the phase document does not exist", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "doc-2",
        ticketId: "ticket-1",
        phase: TICKET_WORKFLOW_PHASE.PLANNING,
        content: "Generated plan",
        storageUrl: null,
        approvalState: "draft",
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
        updatedAt: new Date("2026-03-01T10:00:00.000Z"),
      });
    mockDocumentDAO.create.mockResolvedValue({
      id: "doc-2",
      ticketId: "ticket-1",
      phase: TICKET_WORKFLOW_PHASE.PLANNING,
      content: "",
      storageUrl: null,
      approvalState: "draft",
      approvedAt: null,
      approvedBy: null,
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-01T09:00:00.000Z"),
    });
    mockDocumentDAO.updateContent.mockResolvedValue(undefined);
    mockRevisionDAO.create.mockResolvedValue({
      id: "revision-2",
    });

    const service = new TicketPhaseDocumentService();
    await service.saveDocument(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
      "Generated plan",
      { source: "agent" },
    );

    expect(mockDocumentDAO.create).toHaveBeenCalledWith(
      "ticket-1",
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    expect(mockRevisionDAO.create).toHaveBeenCalledWith({
      documentId: "doc-2",
      ticketId: "ticket-1",
      phase: TICKET_WORKFLOW_PHASE.PLANNING,
      content: "Generated plan",
      source: "agent",
      actor: undefined,
    });
  });
});
