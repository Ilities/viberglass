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
const mockTicketWorkflowService = {
  getTicketWorkflow: jest.fn(),
  advancePhase: jest.fn(),
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

jest.mock("../../../../services/TicketWorkflowService", () => ({
  TicketWorkflowService: jest.fn(() => mockTicketWorkflowService),
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
});
