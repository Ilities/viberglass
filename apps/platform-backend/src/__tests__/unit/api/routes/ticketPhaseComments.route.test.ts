const mockTicketPhaseDocumentCommentService = {
  listComments: jest.fn(),
  createComment: jest.fn(),
  updateComment: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
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

jest.mock("../../../../services/TicketExecutionService", () => ({
  TicketExecutionService: jest.fn(() => ({
    runTicket: jest.fn(),
  })),
}));

jest.mock("../../../../services/TicketWorkflowService", () => ({
  TicketWorkflowService: jest.fn(() => ({
    getTicketWorkflow: jest.fn(),
    advancePhase: jest.fn(),
  })),
}));

jest.mock("../../../../services/TicketPlanningApprovalService", () => ({
  TicketPlanningApprovalService: jest.fn(() => ({
    requestApproval: jest.fn(),
    approve: jest.fn(),
    revokeApproval: jest.fn(),
  })),
}));

jest.mock("../../../../services/TicketWorkflowOverrideService", () => ({
  TicketWorkflowOverrideService: jest.fn(() => ({
    overrideToExecution: jest.fn(),
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

jest.mock("../../../../webhooks/webhookServiceFactory", () => ({
  getFeedbackService: jest.fn(() => undefined),
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

describe("ticket phase comment routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns comment history for a valid phase", async () => {
    mockTicketPhaseDocumentCommentService.listComments.mockResolvedValue([
      {
        id: "comment-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: "research",
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

    const handler = getRouteHandler("/:id/phases/:phase/comments", "get");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        phase: "research",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(mockTicketPhaseDocumentCommentService.listComments).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "research",
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        {
          id: "comment-1",
          documentId: "doc-1",
          ticketId: "ticket-1",
          phase: "research",
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
      phase: "planning",
      lineNumber: 4,
      content: "This needs a rollback plan.",
      status: "open",
      actor: "reviewer@example.com",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z",
    });

    const handler = getRouteHandler("/:id/phases/:phase/comments", "post");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        phase: "planning",
      },
      body: {
        lineNumber: 4,
        content: "This needs a rollback plan.",
      },
      auth: {
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

    expect(mockTicketPhaseDocumentCommentService.createComment).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "planning",
      {
        lineNumber: 4,
        content: "This needs a rollback plan.",
        actor: "reviewer@example.com",
      },
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("updates comment status", async () => {
    mockTicketPhaseDocumentCommentService.updateComment.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      ticketId: "ticket-1",
      phase: "research",
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
      "/:id/phases/:phase/comments/:commentId",
      "put",
    );
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        phase: "research",
        commentId: "22222222-2222-4222-8222-222222222222",
      },
      body: {
        status: "resolved",
      },
      auth: {
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

    expect(mockTicketPhaseDocumentCommentService.updateComment).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "research",
      "22222222-2222-4222-8222-222222222222",
      {
        content: undefined,
        status: "resolved",
        actor: "reviewer@example.com",
      },
    );
  });

  it("rejects execution comments", async () => {
    const handler = getRouteHandler("/:id/phases/:phase/comments", "get");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        phase: "execution",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Comments are only supported for research and planning phases",
    });
  });
});
