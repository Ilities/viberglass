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
const mockTaskAskPolicyService = {
  describe: jest.fn(),
};
const SITUATION = { state: "not_started", label: "Not started", waitingOn: { kind: "nobody" }, since: "2026-10-01T00:00:00.000Z", yourMove: false };
const mockTaskSituationService = {
  describe: jest.fn(async (tasks: Array<{ id: string }>) => new Map(tasks.map((task) => [task.id, { situation: SITUATION }]))),
};
const mockTaskChangePolicyService = {
  describe: jest.fn(),
};
const mockTaskReadDAO = { markRead: jest.fn(), unreadCounts: jest.fn(async (): Promise<Map<string, number>> => new Map()) };
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

jest.mock("../../../../persistence/project/SpaceOwnershipDAO", () => ({
  SpaceOwnershipDAO: jest.fn(() => ({ projectIdForTask: jest.fn().mockResolvedValue("p-1") })),
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

jest.mock("../../../../services/tasks/TaskSituationService", () => ({
  ...jest.requireActual("../../../../services/tasks/TaskSituationService"),
  TaskSituationService: jest.fn(() => mockTaskSituationService),
}));

jest.mock("../../../../persistence/ticketing/TaskReadDAO", () => ({
  TaskReadDAO: jest.fn(() => mockTaskReadDAO),
}));

jest.mock("../../../../services/tasks/TaskChangePolicyService", () => ({
  TaskChangePolicyService: jest.fn(() => mockTaskChangePolicyService),
}));

jest.mock("../../../../services/taskTurns/TaskAskPolicyService", () => ({
  TaskAskPolicyService: jest.fn(() => mockTaskAskPolicyService),
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

import ticketsRouter from "../../../../api/routes/tickets";

const TICKET_ID = "11111111-1111-4111-8111-111111111111";

describe("ticket workflow routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentSessionDAO.listOpenSessionIdsByTicket.mockResolvedValue(new Map());
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const at = new Date();
      req.authContext = {
        user: { id: "user-1", email: "maria@example.com", name: "Maria", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "user-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: ["member"],
        permissions: [],
      };
      next();
    });
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

  it("returns one task with its situation and what the caller may do on it", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({ id: TICKET_ID, status: "open", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
    mockTaskAskPolicyService.describe.mockResolvedValue({ canPost: true, canAsk: true, canAskForCode: false });
    mockTaskChangePolicyService.describe.mockResolvedValue({ canEdit: false, canDelete: false });

    const response = await request(app).get(`/api/tasks/${TICKET_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: TICKET_ID,
      situation: SITUATION,
      capabilities: { canPost: true, canAsk: true, canAskForCode: false, canEdit: false, canDelete: false },
    });
    expect(mockTaskAskPolicyService.describe).toHaveBeenCalledWith("user-1", TICKET_ID);
    expect(mockTaskChangePolicyService.describe).toHaveBeenCalledWith({ id: "user-1", role: "member" }, TICKET_ID);
    expect(mockTaskSituationService.describe).toHaveBeenCalledWith([expect.objectContaining({ id: TICKET_ID })], { id: "user-1", isAdmin: false });
  });

  it("marks a task's thread read for the caller", async () => {
    const response = await request(app).post(`/api/tasks/${TICKET_ID}/read`);
    expect(response.status).toBe(204);
    expect(mockTaskReadDAO.markRead).toHaveBeenCalledWith(TICKET_ID, "user-1");
  });

  it.each([
    ["post", "workflow/override-to-execution"],
    ["post", "phases/planning/approve"],
    ["post", "phases/research/reopen"],
    ["get", "approvals"],
    ["get", "capabilities"],
  ] as const)("no longer has %s /:id/%s", async (method, path) => {
    const response = await request(app)[method](`/api/tasks/${TICKET_ID}/${path}`);
    expect(response.status).toBe(404);
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

  it("marks tasks that have an open live session in GET /api/tasks, each with its situation, last message and unread count", async () => {
    mockTicketDAO.getTicketsWithFilters.mockResolvedValue({
      tickets: [{ id: "ticket-live" }, { id: "ticket-quiet" }],
      total: 2,
    });
    mockAgentSessionDAO.listOpenSessionIdsByTicket.mockResolvedValue(
      new Map([["ticket-live", "session-1"]]),
    );
    mockTaskReadDAO.unreadCounts.mockResolvedValueOnce(new Map([["ticket-quiet", 2]]));

    const response = await request(app).get("/api/tasks").expect(200);

    expect(mockAgentSessionDAO.listOpenSessionIdsByTicket).toHaveBeenCalledWith([
      "ticket-live",
      "ticket-quiet",
    ]);
    expect(response.body.data).toEqual([
      { id: "ticket-live", liveSessionId: "session-1", situation: SITUATION, unread: 0 },
      { id: "ticket-quiet", situation: SITUATION, unread: 2 },
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
