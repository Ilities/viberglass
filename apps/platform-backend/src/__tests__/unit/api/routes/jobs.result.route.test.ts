const mockJobService = {
  getJobStatus: jest.fn(),
  updateJobStatus: jest.fn(),
};

const mockTicketPhaseDocumentService = {
  saveDocument: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("../../../../api/middleware/tenantValidation", () => ({
  tenantMiddleware: jest.fn(),
}));

jest.mock("../../../../api/middleware/callbackTokenValidation", () => ({
  validateCallbackToken: jest.fn(),
}));

jest.mock("../../../../api/middleware/validation", () => ({
  validateResultCallback: jest.fn(),
  validateProgressUpdate: jest.fn(),
  validateCodexAuthCache: jest.fn(),
  validateLogEntry: jest.fn(),
  validateLogBatch: jest.fn(),
}));

jest.mock("../../../../services/JobService", () => ({
  JobService: jest.fn(() => mockJobService),
}));

jest.mock("../../../../services/SecretService", () => ({
  SecretService: jest.fn(() => ({})),
}));

jest.mock("../../../../services/TicketPhaseDocumentService", () => ({
  TicketPhaseDocumentService: jest.fn(() => mockTicketPhaseDocumentService),
}));

import jobsRouter from "../../../../api/routes/jobs";

function getRouteHandler(path: string, method: string): unknown {
  const layer = jobsRouter.stack.find(
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

describe("job result callbacks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists generated planning documents when a planning job completes", async () => {
    mockJobService.getJobStatus.mockResolvedValue({
      status: "active",
      jobKind: "planning",
      ticketId: "ticket-1",
      data: {
        tenantId: "tenant-1",
      },
    });
    mockJobService.updateJobStatus.mockResolvedValue(undefined);
    mockTicketPhaseDocumentService.saveDocument.mockResolvedValue(undefined);

    const handler = getRouteHandler("/:jobId/result", "post");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: { jobId: "job-1" },
      body: {
        success: true,
        documentContent: "Plan snapshot",
      },
      tenantId: "tenant-1",
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(mockTicketPhaseDocumentService.saveDocument).toHaveBeenCalledWith(
      "ticket-1",
      "planning",
      "Plan snapshot",
      { source: "agent" },
    );
    expect(mockJobService.updateJobStatus).toHaveBeenCalledWith(
      "job-1",
      "completed",
      expect.objectContaining({
        result: expect.objectContaining({
          success: true,
          documentContent: "Plan snapshot",
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      jobId: "job-1",
      status: "completed",
    });
  });
});
