const mockTicketPhaseDocumentRevisionService = {
  listRevisions: jest.fn(),
};
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
  TicketPhaseDocumentRevisionService: jest.fn(
    () => mockTicketPhaseDocumentRevisionService,
  ),
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

describe("ticket phase revision routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns revision history for a valid phase", async () => {
    mockTicketPhaseDocumentRevisionService.listRevisions.mockResolvedValue([
      {
        id: "revision-1",
        documentId: "doc-1",
        ticketId: "ticket-1",
        phase: "research",
        content: "First draft",
        source: "manual",
        actor: "author@example.com",
        createdAt: "2026-03-01T09:00:00.000Z",
      },
    ]);

    const handler = getRouteHandler("/:id/phases/:phase/revisions", "get");
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

    expect(mockTicketPhaseDocumentRevisionService.listRevisions).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "research",
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        {
          id: "revision-1",
          documentId: "doc-1",
          ticketId: "ticket-1",
          phase: "research",
          content: "First draft",
          source: "manual",
          actor: "author@example.com",
          createdAt: "2026-03-01T09:00:00.000Z",
        },
      ],
    });
  });

  it("rejects invalid workflow phases", async () => {
    const handler = getRouteHandler("/:id/phases/:phase/revisions", "get");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: {
        id: "11111111-1111-4111-8111-111111111111",
        phase: "not-a-phase",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid workflow phase",
    });
  });
});
