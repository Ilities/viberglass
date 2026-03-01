import express from "express";
import request from "supertest";

const mockTicketDAO = {
  getTicket: jest.fn(),
  createTicket: jest.fn(),
  updateTicket: jest.fn(),
  deleteTicket: jest.fn(),
  getTicketsWithFilters: jest.fn(),
  archiveTickets: jest.fn(),
  unarchiveTickets: jest.fn(),
  getTicketStats: jest.fn(),
  getMediaAssetById: jest.fn(),
};
const mockProjectDAO = {
  findByName: jest.fn(),
};
const mockFileUploadService = {
  uploadScreenshot: jest.fn(),
  uploadRecording: jest.fn(),
  generateSignedUrlFromStorageUrl: jest.fn(),
  getMediaContentUrl: jest.fn(),
};
const mockTicketExecutionService = {
  runTicket: jest.fn(),
};
const mockTicketPlanningApprovalService = {
  requestApproval: jest.fn(),
  approve: jest.fn(),
  revokeApproval: jest.fn(),
};
const mockTicketWorkflowOverrideService = {
  overrideToExecution: jest.fn(),
};
const mockTicketWorkflowService = {
  getTicketWorkflow: jest.fn(),
  advancePhase: jest.fn(),
};
const mockTicketPhaseDocumentRevisionService = {
  listRevisions: jest.fn(),
};
const mockTicketPhaseDocumentCommentService = {
  listComments: jest.fn(),
  createComment: jest.fn(),
  updateComment: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock("../../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));

jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => mockProjectDAO),
}));

jest.mock("../../../../services/FileUploadService", () => ({
  FileUploadService: jest.fn(() => mockFileUploadService),
  upload: {
    fields: () =>
      (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
        next(),
  },
}));

jest.mock("../../../../services/TicketExecutionService", () => ({
  TicketExecutionService: jest.fn(() => mockTicketExecutionService),
}));

jest.mock("../../../../services/TicketPlanningApprovalService", () => ({
  TicketPlanningApprovalService: jest.fn(
    () => mockTicketPlanningApprovalService,
  ),
}));

jest.mock("../../../../services/TicketWorkflowOverrideService", () => ({
  TicketWorkflowOverrideService: jest.fn(
    () => mockTicketWorkflowOverrideService,
  ),
}));

jest.mock("../../../../services/TicketWorkflowService", () => ({
  TicketWorkflowService: jest.fn(() => mockTicketWorkflowService),
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

const TICKET_ID = "11111111-1111-4111-8111-111111111111";

describe("ticket workflow routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketsRouter);
  });

  it("returns workflow state for GET /:id/phases", async () => {
    mockTicketWorkflowService.getTicketWorkflow.mockResolvedValue({
      ticketId: TICKET_ID,
      workflowPhase: "research",
      phases: [
        { phase: "research", status: "current" },
        { phase: "planning", status: "upcoming" },
        { phase: "execution", status: "upcoming" },
      ],
    });

    const response = await request(app)
      .get(`/api/tickets/${TICKET_ID}/phases`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        ticketId: TICKET_ID,
        workflowPhase: "research",
        phases: [
          { phase: "research", status: "current" },
          { phase: "planning", status: "upcoming" },
          { phase: "execution", status: "upcoming" },
        ],
      },
    });
  });

  it("returns 404 when workflow is requested for a missing ticket", async () => {
    mockTicketWorkflowService.getTicketWorkflow.mockRejectedValue(
      new Error("Ticket not found"),
    );

    const response = await request(app)
      .get(`/api/tickets/${TICKET_ID}/phases`)
      .expect(404);

    expect(response.body).toEqual({ error: "Ticket not found" });
  });

  it("returns document revisions for GET /:id/phases/:phase/revisions", async () => {
    mockTicketPhaseDocumentRevisionService.listRevisions.mockResolvedValue([
      {
        id: "revision-1",
        documentId: "doc-1",
        ticketId: TICKET_ID,
        phase: "research",
        content: "First draft",
        source: "manual",
        actor: "author@example.com",
        createdAt: "2026-03-01T09:00:00.000Z",
      },
    ]);

    const response = await request(app)
      .get(`/api/tickets/${TICKET_ID}/phases/research/revisions`)
      .expect(200);

    expect(mockTicketPhaseDocumentRevisionService.listRevisions).toHaveBeenCalledWith(
      TICKET_ID,
      "research",
    );
    expect(response.body).toEqual({
      success: true,
      data: [
        {
          id: "revision-1",
          documentId: "doc-1",
          ticketId: TICKET_ID,
          phase: "research",
          content: "First draft",
          source: "manual",
          actor: "author@example.com",
          createdAt: "2026-03-01T09:00:00.000Z",
        },
      ],
    });
  });

  it("returns 400 for invalid revision phase params", async () => {
    const response = await request(app)
      .get(`/api/tickets/${TICKET_ID}/phases/not-a-phase/revisions`)
      .expect(400);

    expect(response.body).toEqual({ error: "Invalid workflow phase" });
  });

  it("advances from research to planning", async () => {
    mockTicketWorkflowService.advancePhase.mockResolvedValue({
      ticketId: TICKET_ID,
      workflowPhase: "planning",
    });

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/planning/advance`)
      .expect(200);

    expect(mockTicketWorkflowService.advancePhase).toHaveBeenCalledWith(
      TICKET_ID,
      "planning",
    );
    expect(response.body).toEqual({
      success: true,
      data: {
        ticketId: TICKET_ID,
        workflowPhase: "planning",
      },
    });
  });

  it("advances from planning to execution", async () => {
    mockTicketWorkflowService.advancePhase.mockResolvedValue({
      ticketId: TICKET_ID,
      workflowPhase: "execution",
    });

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/execution/advance`)
      .expect(200);

    expect(response.body.data.workflowPhase).toBe("execution");
  });

  it("returns 400 for invalid phase params", async () => {
    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/not-a-phase/advance`)
      .expect(400);

    expect(response.body).toEqual({ error: "Invalid workflow phase" });
  });

  it("returns 409 for disallowed transitions", async () => {
    mockTicketWorkflowService.advancePhase.mockRejectedValue(
      new Error("Cannot advance ticket workflow from research to execution"),
    );

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/execution/advance`)
      .expect(409);

    expect(response.body).toEqual({
      error: "Cannot advance ticket workflow from research to execution",
    });
  });

  it("returns 404 when advancing a missing ticket", async () => {
    mockTicketWorkflowService.advancePhase.mockRejectedValue(
      new Error("Ticket not found"),
    );

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/planning/advance`)
      .expect(404);

    expect(response.body).toEqual({ error: "Ticket not found" });
  });

  it("approves planning and returns the updated phase view", async () => {
    mockTicketPlanningApprovalService.approve.mockResolvedValue({
      document: {
        id: "doc-1",
        ticketId: TICKET_ID,
        phase: "planning",
        content: "Approved plan",
        approvalState: "approved",
        approvedAt: "2026-03-01T10:00:00.000Z",
        approvedBy: "approver@example.com",
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T10:00:00.000Z",
      },
      latestRun: null,
    });

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/phases/planning/approve`)
      .expect(200);

    expect(mockTicketPlanningApprovalService.approve).toHaveBeenCalledWith(
      TICKET_ID,
      undefined,
    );
    expect(response.body.data.document.approvalState).toBe("approved");
  });

  it("returns 409 when execution is blocked by planning approval", async () => {
    mockTicketExecutionService.runTicket.mockRejectedValue(
      new Error("Execution is blocked until the planning document is approved"),
    );

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/run`)
      .send({ clankerId: "clanker-1" })
      .expect(409);

    expect(response.body.message).toBe(
      "Execution is blocked until the planning document is approved",
    );
  });

  it("overrides the workflow to execution and returns the updated ticket", async () => {
    mockTicketWorkflowOverrideService.overrideToExecution.mockResolvedValue({
      id: TICKET_ID,
      workflowPhase: "execution",
      workflowOverrideReason: "Urgent production fix",
      workflowOverriddenAt: "2026-03-01T12:00:00.000Z",
      workflowOverriddenBy: "approver@example.com",
    });

    const response = await request(app)
      .post(`/api/tickets/${TICKET_ID}/workflow/override-to-execution`)
      .send({ reason: "Urgent production fix" })
      .expect(200);

    expect(mockTicketWorkflowOverrideService.overrideToExecution).toHaveBeenCalledWith(
      TICKET_ID,
      "Urgent production fix",
      undefined,
    );
    expect(response.body.data.workflowPhase).toBe("execution");
  });
});
