const mockTicketDAO = {
  getTicket: jest.fn(),
};

const mockDocumentDAO = {
  getByTicketAndPhase: jest.fn(),
};

const mockCommentDAO = {
  listByTicketAndPhase: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentDAO", () => ({
  TicketPhaseDocumentDAO: jest.fn(() => mockDocumentDAO),
}));

jest.mock("../../../persistence/ticketing/TicketPhaseDocumentCommentDAO", () => ({
  PHASE_DOCUMENT_COMMENT_STATUS: {
    OPEN: "open",
    RESOLVED: "resolved",
  },
  TicketPhaseDocumentCommentDAO: jest.fn(() => mockCommentDAO),
}));

import { TicketPhaseDocumentCommentService } from "../../../services/TicketPhaseDocumentCommentService";

describe("TicketPhaseDocumentCommentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists comments where their text is in the document now", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({ id: "doc-1", content: "Intro\n\nNew line\nWe assume X." });
    mockCommentDAO.listByTicketAndPhase.mockResolvedValue([
      {
        id: "comment-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: "research",
        lineNumber: 3,
        quote: { exact: "assume X", prefix: "We ", suffix: "." },
        content: "Please verify this assumption.",
        status: "open",
        actor: "reviewer@example.com",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
        updatedAt: new Date("2026-03-01T09:05:00.000Z"),
      },
    ]);

    const service = new TicketPhaseDocumentCommentService();
    const comments = await service.listComments("ticket-1", "research");

    expect(comments).toEqual([
      {
        id: "comment-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: "research",
        lineNumber: 4,
        quote: { exact: "assume X", prefix: "We ", suffix: "." },
        location: { start: 19, end: 27, line: 4 },
        outdated: false,
        content: "Please verify this assumption.",
        status: "open",
        actor: "reviewer@example.com",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:05:00.000Z",
      },
    ]);
  });

  it("marks a comment outdated once its text is gone from the document", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({ id: "doc-1", content: "Rewritten entirely." });
    mockCommentDAO.listByTicketAndPhase.mockResolvedValue([
      {
        id: "comment-1",
        lineNumber: 3,
        quote: { exact: "assume X", prefix: "", suffix: "" },
        content: "Verify",
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
      },
    ]);

    const [comment] = await new TicketPhaseDocumentCommentService().listComments("ticket-1", "research");

    expect(comment).toMatchObject({ outdated: true, location: null, lineNumber: 3 });
  });

  it("creates a comment on quoted text, on the line the text is on", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({ id: "doc-1", content: "First line\nSecond **line**" });
    mockCommentDAO.create.mockImplementation(async (input) => ({ ...input, id: "c-1", createdAt: new Date(), updatedAt: new Date(), resolvedAt: null }));
    const quote = { exact: "Second **line**", prefix: "First line\n", suffix: "" };

    const comment = await new TicketPhaseDocumentCommentService().createComment("ticket-1", "planning", { quote, content: "Why bold?" });

    expect(mockCommentDAO.create).toHaveBeenCalledWith(expect.objectContaining({ lineNumber: 2, quote, content: "Why bold?" }));
    expect(comment.location).toEqual({ start: 11, end: 26, line: 2 });
  });

  it("refuses a quote that isn't in the document", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({ id: "doc-1", content: "First line" });

    await expect(
      new TicketPhaseDocumentCommentService().createComment("ticket-1", "planning", {
        quote: { exact: "Missing", prefix: "", suffix: "" },
        content: "Hm",
      }),
    ).rejects.toThrow("The quoted text isn't in the document");
  });

  it("creates a comment when the line anchor is valid", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "First line\nSecond line",
    });
    mockCommentDAO.create.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "planning",
      lineNumber: 2,
      content: "Needs more detail",
      status: "open",
      actor: "reviewer@example.com",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    });

    const service = new TicketPhaseDocumentCommentService();
    await service.createComment("ticket-1", "planning", {
      lineNumber: 2,
      content: "  Needs more detail  ",
      actor: "reviewer@example.com",
    });

    expect(mockCommentDAO.create).toHaveBeenCalledWith({
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "planning",
      lineNumber: 2,
      quote: { exact: "Second line", prefix: "First line\n", suffix: "" },
      content: "Needs more detail",
      actor: "reviewer@example.com",
    });
  });

  it("rejects comments for empty documents", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "",
    });

    const service = new TicketPhaseDocumentCommentService();

    await expect(
      service.createComment("ticket-1", "research", {
        lineNumber: 1,
        content: "Question",
      }),
    ).rejects.toThrow("Cannot comment on an empty document");
  });

  it("rejects out-of-range line anchors", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: "ticket-1" });
    mockDocumentDAO.getByTicketAndPhase.mockResolvedValue({
      id: "doc-1",
      content: "Only one line",
    });

    const service = new TicketPhaseDocumentCommentService();

    await expect(
      service.createComment("ticket-1", "research", {
        lineNumber: 2,
        content: "Question",
      }),
    ).rejects.toThrow("Line anchor is out of range");
  });

  it("resolves a comment", async () => {
    mockCommentDAO.getById.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "research",
      lineNumber: 1,
      content: "Open comment",
      status: "open",
      actor: "reviewer@example.com",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-01T09:00:00.000Z"),
    });
    mockCommentDAO.update.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "research",
      lineNumber: 1,
      content: "Open comment",
      status: "resolved",
      actor: "reviewer@example.com",
      resolvedAt: new Date("2026-03-01T10:00:00.000Z"),
      resolvedBy: "reviewer@example.com",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    });

    const service = new TicketPhaseDocumentCommentService();
    await service.updateComment("ticket-1", "research", "comment-1", {
      status: "resolved",
      actor: "reviewer@example.com",
    });

    expect(mockCommentDAO.update).toHaveBeenCalledWith(
      "comment-1",
      expect.objectContaining({
        content: "Open comment",
        status: "resolved",
        resolvedBy: "reviewer@example.com",
        resolvedAt: expect.any(Date),
      }),
    );
  });

  it("reopens a resolved comment", async () => {
    mockCommentDAO.getById.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "planning",
      lineNumber: 4,
      content: "Resolved comment",
      status: "resolved",
      actor: "reviewer@example.com",
      resolvedAt: new Date("2026-03-01T10:00:00.000Z"),
      resolvedBy: "reviewer@example.com",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    });
    mockCommentDAO.update.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "planning",
      lineNumber: 4,
      content: "Resolved comment",
      status: "open",
      actor: "reviewer@example.com",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-01T11:00:00.000Z"),
    });

    const service = new TicketPhaseDocumentCommentService();
    await service.updateComment("ticket-1", "planning", "comment-1", {
      status: "open",
    });

    expect(mockCommentDAO.update).toHaveBeenCalledWith(
      "comment-1",
      expect.objectContaining({
        content: "Resolved comment",
        status: "open",
        resolvedAt: null,
        resolvedBy: null,
      }),
    );
  });
});
