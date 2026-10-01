import express from "express";
import request from "supertest";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "../../../../services/errors/TicketServiceError";

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
const mockAgentSessionDAO = {
  listOpenSessionIdsByTicket: jest.fn(),
};
const mockFileUploadService = {
  uploadScreenshot: jest.fn(),
  uploadRecording: jest.fn(),
  generateSignedUrlFromStorageUrl: jest.fn(),
  getMediaContentUrl: jest.fn(),
};
const mockTaskTurnService = {
  ask: jest.fn(),
};
const mockTicketPlanningApprovalService = {
  approve: jest.fn(),
  revokeApproval: jest.fn(),
};
const mockTicketWorkflowOverrideService = {
  overrideToExecution: jest.fn(),
};
const mockTicketWorkflowService = {
  getTicketWorkflow: jest.fn(),
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
  requireRole: () => (
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

jest.mock("../../../../services/spaces/SpaceAccessService", () => ({
  SpaceAccessService: jest.fn(() => ({
    scopeFor: jest.fn().mockResolvedValue({ projectId: undefined, projectIds: null }),
    assertCanSee: jest.fn().mockResolvedValue({ projectId: "p-1", membership: null }),
  })),
}));

jest.mock("../../../../persistence/ticketing/TaskParticipantDAO", () => ({
  TaskParticipantDAO: jest.fn(() => ({ listOwners: jest.fn().mockResolvedValue(new Map()) })),
}));

jest.mock("../../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockAgentSessionDAO),
}));

jest.mock("../../../../services/FileUploadService", () => ({
  FileUploadService: jest.fn(() => mockFileUploadService),
  upload: {
    fields: () =>
      (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
        next(),
  },
}));

jest.mock("../../../../services/taskTurns/TaskTurnService", () => ({
  TaskTurnService: jest.fn(() => mockTaskTurnService),
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
    mockAgentSessionDAO.listOpenSessionIdsByTicket.mockResolvedValue(new Map());
    app = express();
    app.use(express.json());
    app.use("/api/tasks", ticketsRouter);
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
      .get(`/api/tasks/${TICKET_ID}/phases`)
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
      .get(`/api/tasks/${TICKET_ID}/phases`)
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
      .get(`/api/tasks/${TICKET_ID}/phases/research/revisions`)
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
      .get(`/api/tasks/${TICKET_ID}/phases/not-a-phase/revisions`)
      .expect(400);

    expect(response.body).toEqual({ error: "Invalid workflow phase" });
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
      .post(`/api/tasks/${TICKET_ID}/workflow/override-to-execution`)
      .send({ reason: "Urgent production fix" })
      .expect(200);

    expect(mockTicketWorkflowOverrideService.overrideToExecution).toHaveBeenCalledWith(
      TICKET_ID,
      "Urgent production fix",
      null,
    );
    expect(response.body.data.workflowPhase).toBe("execution");
  });

  it("returns 400 when override validation fails", async () => {
    mockTicketWorkflowOverrideService.overrideToExecution.mockRejectedValue(
      new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.WORKFLOW_OVERRIDE_REASON_REQUIRED,
        "workflow override reason is required",
      ),
    );

    const response = await request(app)
      .post(`/api/tasks/${TICKET_ID}/workflow/override-to-execution`)
      .send({ reason: "   " })
      .expect(400);

    expect(response.body.message).toBe("workflow override reason is required");
  });

  it("passes workflow phase filters through GET /api/tasks", async () => {
    mockTicketDAO.getTicketsWithFilters.mockResolvedValue({
      tickets: [],
      total: 0,
    });

    await request(app)
      .get("/api/tasks")
      .query({
        statuses: "open,in_progress",
        workflowPhases: "research,planning",
      })
      .expect(200);

    expect(mockTicketDAO.getTicketsWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ["open", "in_progress"],
        workflowPhases: ["research", "planning"],
      }),
    );
  });

  it("marks tasks that have an open live session in GET /api/tasks", async () => {
    mockTicketDAO.getTicketsWithFilters.mockResolvedValue({
      tickets: [{ id: "ticket-live" }, { id: "ticket-quiet" }],
      total: 2,
    });
    mockAgentSessionDAO.listOpenSessionIdsByTicket.mockResolvedValue(
      new Map([["ticket-live", "session-1"]]),
    );

    const response = await request(app).get("/api/tasks").expect(200);

    expect(mockAgentSessionDAO.listOpenSessionIdsByTicket).toHaveBeenCalledWith([
      "ticket-live",
      "ticket-quiet",
    ]);
    expect(response.body.data).toEqual([
      { id: "ticket-live", liveSessionId: "session-1" },
      { id: "ticket-quiet" },
    ]);
  });

  it("returns 400 for invalid workflow phase filters on GET /api/tasks", async () => {
    const response = await request(app)
      .get("/api/tasks")
      .query({ workflowPhases: "research,invalid-phase" })
      .expect(400);

    expect(response.body).toEqual({
      error: "Invalid workflowPhases filter",
    });
  });
});
