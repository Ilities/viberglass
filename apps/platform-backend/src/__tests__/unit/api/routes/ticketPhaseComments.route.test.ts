const mockTicketPhaseDocumentCommentService = {
  listComments: jest.fn(),
  createComment: jest.fn(),
  updateComment: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
  requireRole: jest.fn(() => jest.fn()),
}));

jest.mock("../../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => ({
    getTicket: jest.fn(),
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
    deleteTicket: jest.fn(),
    getTicketsWithFilters: jest.fn(),
    archiveTickets: jest.fn(),
    unarchiveTickets: jest.fn(),
    getTicketStats: jest.fn(),
    getMediaAssetById: jest.fn(),
  })),
}));

jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => ({
    findByName: jest.fn(),
  })),
}));

jest.mock("../../../../services/FileUploadService", () => ({
  FileUploadService: jest.fn(() => ({
    uploadScreenshot: jest.fn(),
    uploadRecording: jest.fn(),
    generateSignedUrlFromStorageUrl: jest.fn(),
    getMediaContentUrl: jest.fn(),
  })),
  upload: {
    fields: jest.fn(() => jest.fn()),
  },
}));

jest.mock("../../../../services/taskTurns/TaskTurnService", () => ({
  TaskTurnService: jest.fn(() => ({ ask: jest.fn() })),
}));

jest.mock("../../../../services/TicketWorkflowService", () => ({
  TicketWorkflowService: jest.fn(() => ({
    getTicketWorkflow: jest.fn(),
  })),
}));

jest.mock("../../../../services/TicketPhaseDocumentRevisionService", () => ({
  TicketPhaseDocumentRevisionService: jest.fn(() => ({
    listRevisions: jest.fn(),
  })),
}));

jest.mock("../../../../services/TicketPhaseDocumentCommentService", () => ({
  TicketPhaseDocumentCommentService: jest.fn(
    () => mockTicketPhaseDocumentCommentService,
  ),
}));

import ticketsRouter from "../../../../api/routes/tickets";

function getRouteHandler(path: string, method: string): unknown {
  const layer = ticketsRouter.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      Reflect.get(entry.route, "methods")?.[method.toLowerCase()] === true,
  );

  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const stack = Reflect.get(layer.route, "stack");
  return stack[stack.length - 1].handle;
}

describe("plan comment routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the plan's comments", async () => {
    mockTicketPhaseDocumentCommentService.listComments.mockResolvedValue([
      {
        id: "comment-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        lineNumber: 2,
        content: "Clarify this point",
        status: "open",
        actor: "reviewer@example.com",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z",
      },
    ]);

    const handler = getRouteHandler("/:id/plan/comments", "get");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(
      mockTicketPhaseDocumentCommentService.listComments,
    ).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        {
          id: "comment-1",
          documentId: "doc-1",
          ticketId: "ticket-1",
          lineNumber: 2,
          content: "Clarify this point",
          status: "open",
          actor: "reviewer@example.com",
          resolvedAt: null,
          resolvedBy: null,
          createdAt: "2026-03-01T09:00:00.000Z",
          updatedAt: "2026-03-01T09:00:00.000Z",
        },
      ],
    });
  });

  it("creates a new comment", async () => {
    mockTicketPhaseDocumentCommentService.createComment.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      lineNumber: 4,
      content: "This needs a rollback plan.",
      status: "open",
      actor: "reviewer@example.com",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z",
    });

    const handler = getRouteHandler("/:id/plan/comments", "post");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
      },
      body: {
        lineNumber: 4,
        content: "This needs a rollback plan.",
      },
      authContext: {
        user: {
          email: "reviewer@example.com",
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(
      mockTicketPhaseDocumentCommentService.createComment,
    ).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      lineNumber: 4,
      content: "This needs a rollback plan.",
      actor: "reviewer@example.com",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("updates comment status", async () => {
    mockTicketPhaseDocumentCommentService.updateComment.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      lineNumber: 2,
      content: "Clarify this point",
      status: "resolved",
      actor: "reviewer@example.com",
      resolvedAt: "2026-03-01T10:00:00.000Z",
      resolvedBy: "reviewer@example.com",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    });

    const handler = getRouteHandler(
      "/:id/plan/comments/:commentId",
      "put",
    );
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        commentId: "22222222-2222-4222-8222-222222222222",
      },
      body: {
        status: "resolved",
      },
      authContext: {
        user: {
          email: "reviewer@example.com",
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(
      mockTicketPhaseDocumentCommentService.updateComment,
    ).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      {
        content: undefined,
        status: "resolved",
        actor: "reviewer@example.com",
      },
    );
  });

});
