const mockJobService = {
  getJobStatus: jest.fn(),
  getBootstrapPayload: jest.fn(),
  updateJobStatus: jest.fn(),
  deleteJob: jest.fn(),
};

const mockTurnOutcomes = {
  record: jest.fn(),
};
const mockAutoSummariser = { afterTurn: jest.fn() };
const mockDocumentCheck = { missing: jest.fn() };

const mockSecretService = {
  upsertWorkerAuthCache: jest.fn(),
  resolveBindings: jest.fn(),
};

const mockCodexLogins = { saveLogin: jest.fn() };

const mockAgentTurnDAO = {
  getByJobId: jest.fn(),
  getById: jest.fn(),
};

const mockAgentSessionDAO = {
  getById: jest.fn(),
  listByLastJobId: jest.fn(),
};

const mockAgentSessionEventDAO = {
  getMaxSequence: jest.fn(),
  create: jest.fn(),
  listByJob: jest.fn(),
};

const mockAgentPendingRequestDAO = {};

const mockAgentSessionWorkerEventService = {
  batchIngest: jest.fn(),
};

const mockTouchHeartbeat = jest.fn();
const mockRunRecordGet = jest.fn();

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
  requireRole: jest.fn(() => jest.fn()),
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
jest.mock("../../../../services/job/JobQueryService", () => ({
  JobQueryService: jest.fn(() => ({ getJobStatus: (...args: unknown[]) => mockJobService.getJobStatus(...args) })),
}));

jest.mock("../../../../services/job/JobBootstrapService", () => ({
  JobBootstrapService: jest.fn(() => ({ getBootstrapPayload: (...args: unknown[]) => mockJobService.getBootstrapPayload(...args) })),
}));
jest.mock("../../../../services/SecretResolutionService", () => ({
  SecretResolutionService: jest.fn(() => mockSecretService),
}));

jest.mock("../../../../services/codexLogin/CodexLoginService", () => ({
  CodexLoginService: jest.fn(() => mockCodexLogins),
}));

jest.mock("../../../../services/SecretService", () => ({
  SecretService: jest.fn(() => mockSecretService),
}));

jest.mock("../../../../services/taskTurns/TaskAutoSummariser", () => ({
  TaskAutoSummariser: jest.fn(() => mockAutoSummariser),
}));

jest.mock("../../../../services/taskTurns/TaskTurnService", () => ({
  TaskTurnService: jest.fn(() => ({})),
}));

jest.mock("../../../../services/taskTurns/TurnDocumentCheck", () => ({
  TurnDocumentCheck: jest.fn(() => mockDocumentCheck),
}));

jest.mock("../../../../services/taskTurns/TaskTurnOutcomeService", () => ({
  TaskTurnOutcomeService: jest.fn(() => mockTurnOutcomes),
}));

jest.mock("../../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => mockAgentTurnDAO),
}));

jest.mock("../../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockAgentSessionDAO),
}));

jest.mock("../../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => mockAgentSessionEventDAO),
}));

jest.mock("../../../../persistence/agentSession/AgentPendingRequestDAO", () => ({
  AgentPendingRequestDAO: jest.fn(() => mockAgentPendingRequestDAO),
}));

jest.mock("../../../../services/agentSession/AgentSessionWorkerEventService", () => ({
  AgentSessionWorkerEventService: jest.fn(() => mockAgentSessionWorkerEventService),
}));

jest.mock("../../../../services/job/JobProgressService", () => ({
  recordLog: jest.fn(),
  recordLogBatch: jest.fn(),
  recordProgress: jest.fn(),
  touchHeartbeat: (...args: unknown[]) => mockTouchHeartbeat(...args),
}));

jest.mock("../../../../persistence/job/RunRecordDAO", () => ({ RunRecordDAO: jest.fn() }));
jest.mock("../../../../services/runRecords/RunRecordService", () => ({
  RunRecordService: jest.fn(() => ({ get: (...args: unknown[]) => mockRunRecordGet(...args) })),
}));

import jobsRouter from "../../../../api/routes/jobs";
import {
  JobServiceError,
  JOB_SERVICE_ERROR_CODE,
} from "../../../../services/errors/JobServiceError";
import {
  SecretServiceError,
  SECRET_SERVICE_ERROR_CODE,
} from "../../../../services/errors/SecretServiceError";

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
    mockJobService.getBootstrapPayload.mockResolvedValue(null);
    mockAgentTurnDAO.getByJobId.mockResolvedValue(null);
    mockAgentSessionDAO.listByLastJobId.mockResolvedValue([]);
    mockDocumentCheck.missing.mockResolvedValue(null);
  });

  function resultHandler(): (req: unknown, res: unknown) => Promise<void> {
    const handler = getRouteHandler("/:jobId/result", "post");
    if (typeof handler !== "function") throw new Error("Route handler was not a function");
    return async (req, res) => {
      await handler(req, res);
    };
  }

  function response() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  }

  it("delivers only a Kubernetes run's credentials without persisting them", async () => {
    const payload = { workerType: "kubernetes", requiredCredentials: [{ envVar: "AGENT_KEY" }] };
    mockJobService.getBootstrapPayload.mockResolvedValue({ tenantId: "tenant-1", status: "active", payload });
    mockSecretService.resolveBindings.mockResolvedValue({ AGENT_KEY: "private-value" });
    const handler = getRouteHandler("/:jobId/bootstrap", "get");
    if (typeof handler !== "function") throw new Error("Missing bootstrap handler");
    const res = { ...response(), setHeader: jest.fn() };
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1" }, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { ...payload, credentials: { AGENT_KEY: "private-value" } } });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(payload).not.toHaveProperty("credentials");
  });

  it.each(["completed", "failed", "cancelled"])("refuses bootstrap credentials for a %s run", async (status) => {
    mockJobService.getBootstrapPayload.mockResolvedValue({
      tenantId: "tenant-1", status, payload: { workerType: "kubernetes", requiredCredentials: [{ envVar: "AGENT_KEY" }] },
    });
    const handler = getRouteHandler("/:jobId/bootstrap", "get");
    if (typeof handler !== "function") throw new Error("Missing bootstrap handler");
    const res = response();
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1" }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSecretService.resolveBindings).not.toHaveBeenCalled();
  });

  it("refuses bootstrap credentials when the tenant differs", async () => {
    mockJobService.getBootstrapPayload.mockResolvedValue({
      tenantId: "tenant-2", status: "active", payload: { workerType: "kubernetes", requiredCredentials: [{ envVar: "AGENT_KEY" }] },
    });
    const handler = getRouteHandler("/:jobId/bootstrap", "get");
    if (typeof handler !== "function") throw new Error("Missing bootstrap handler");
    const res = response();
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1" }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSecretService.resolveBindings).not.toHaveBeenCalled();
  });

  it("stores a Kubernetes Codex auth refresh in the encrypted database", async () => {
    mockJobService.getJobStatus.mockResolvedValue({ data: { tenantId: "tenant-1" } });
    mockJobService.getBootstrapPayload.mockResolvedValue({
      status: "active", payload: { workerType: "kubernetes", requiredCredentials: [{ envVar: "CODEX_AUTH" }] },
    });
    mockSecretService.upsertWorkerAuthCache.mockResolvedValue({ id: "secret-1", secretLocation: "database" });
    const handler = getRouteHandler("/:jobId/codex-auth-cache", "post");
    if (typeof handler !== "function") throw new Error("Missing auth cache handler");
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1", body: { secretName: "CODEX_AUTH", authJson: "{}" } }, response());
    expect(mockSecretService.upsertWorkerAuthCache).toHaveBeenCalledWith("CODEX_AUTH", "{}", "database");
  });

  it("updates the Kubernetes runner's stored Codex login", async () => {
    mockJobService.getJobStatus.mockResolvedValue({ clankerId: "runner-1", data: { tenantId: "tenant-1" } });
    mockJobService.getBootstrapPayload.mockResolvedValue({ status: "active", payload: {
      workerType: "kubernetes", requiredCredentials: [{ envVar: "CODEX_AUTH_JSON", exposeToAgent: false }],
    } });
    mockCodexLogins.saveLogin.mockResolvedValue({ id: "login-1", secretLocation: "database" });
    const handler = getRouteHandler("/:jobId/codex-auth-cache", "post");
    if (typeof handler !== "function") throw new Error("Missing auth cache handler");
    const res = response();
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1", body: { secretName: "CODEX_AUTH_JSON", authJson: "{}" } }, res);
    expect(mockCodexLogins.saveLogin).toHaveBeenCalledWith("runner-1", "{}");
    expect(mockSecretService.upsertWorkerAuthCache).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, secretId: "login-1", secretLocation: "database" });
  });

  it("refuses a Kubernetes auth refresh for an unlisted secret", async () => {
    mockJobService.getJobStatus.mockResolvedValue({ data: { tenantId: "tenant-1" } });
    mockJobService.getBootstrapPayload.mockResolvedValue({
      status: "active", payload: { workerType: "kubernetes", requiredCredentials: [] },
    });
    const handler = getRouteHandler("/:jobId/codex-auth-cache", "post");
    if (typeof handler !== "function") throw new Error("Missing auth cache handler");
    const res = response();
    await handler({ params: { jobId: "job-1" }, tenantId: "tenant-1", body: { secretName: "OTHER", authJson: "{}" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSecretService.upsertWorkerAuthCache).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    mockJobService.getJobStatus.mockResolvedValue({ status: "active", jobKind: "reply", ticketId: "ticket-1", data: { tenantId: "tenant-1" } });
    mockJobService.updateJobStatus.mockResolvedValue(undefined);
  });

  it("records what a task turn produced, then the run's status", async () => {
    const turn = { id: "turn-1", sessionId: "session-1" };
    const session = { id: "session-1", ticketId: "ticket-1" };
    mockAgentTurnDAO.getByJobId.mockResolvedValue(turn);
    mockAgentSessionDAO.getById.mockResolvedValue(session);
    const res = response();

    await resultHandler()(
      {
        params: { jobId: "job-1" },
        body: {
          success: true,
          documents: { plan: "# Plan" },
          sessionStart: { resumed: true, via: "load" },
          commitHash: "abc123",
          codeDiscarded: false,
        },
        tenantId: "tenant-1",
      },
      res,
    );

    expect(mockTurnOutcomes.record).toHaveBeenCalledWith("job-1", session, turn, {
      success: true,
      documents: { plan: "# Plan" },
      codeDiscarded: false,
      resumed: true,
      commitHash: "abc123",
      compacted: false,
    });
    expect(mockJobService.updateJobStatus).toHaveBeenCalledWith("job-1", "completed", expect.objectContaining({ result: expect.objectContaining({ success: true }) }));
    expect(res.json).toHaveBeenCalledWith({ success: true, jobId: "job-1", status: "completed" });
    expect(mockAutoSummariser.afterTurn).toHaveBeenCalledWith(session, turn, undefined);
  });

  it("passes the context the harness reported on, so a full one can be summarised once the run has finished", async () => {
    const turn = { id: "turn-1", sessionId: "session-1", action: "plan" };
    const session = { id: "session-1", ticketId: "ticket-1", clankerId: "c-1" };
    mockAgentTurnDAO.getByJobId.mockResolvedValue(turn);
    mockAgentSessionDAO.getById.mockResolvedValue(session);

    await resultHandler()(
      { params: { jobId: "job-1" }, body: { success: true, contextUsage: { used: 150000, size: 200000 }, compacted: true }, tenantId: "tenant-1" },
      response(),
    );

    expect(mockTurnOutcomes.record).toHaveBeenCalledWith("job-1", session, turn, expect.objectContaining({ contextUsage: { used: 150000, size: 200000 }, compacted: true }));
    expect(mockAutoSummariser.afterTurn).toHaveBeenCalledWith(session, turn, { used: 150000, size: 200000 });
    expect(mockJobService.updateJobStatus.mock.invocationCallOrder[0]).toBeLessThan(mockAutoSummariser.afterTurn.mock.invocationCallOrder.at(-1) ?? 0);
  });

  it("fails a turn that came back without the document it was asked for", async () => {
    const turn = { id: "turn-1", sessionId: "session-1", action: "plan" };
    const session = { id: "session-1", ticketId: "ticket-1" };
    mockAgentTurnDAO.getByJobId.mockResolvedValue(turn);
    mockAgentSessionDAO.getById.mockResolvedValue(session);
    mockDocumentCheck.missing.mockResolvedValue("plan");
    const res = response();

    await resultHandler()({ params: { jobId: "job-1" }, body: { success: true, documents: { summary: "# Notes" } }, tenantId: "tenant-1" }, res);

    expect(mockDocumentCheck.missing).toHaveBeenCalledWith(turn, { summary: "# Notes" });
    expect(mockTurnOutcomes.record).toHaveBeenCalledWith("job-1", session, turn, expect.objectContaining({ success: true, missing: "plan", documents: { summary: "# Notes" } }));
    expect(mockJobService.updateJobStatus).toHaveBeenCalledWith(
      "job-1",
      "failed",
      expect.objectContaining({ failureCode: "AGENT_NO_DOCUMENT", errorMessage: "The agent finished without writing the plan." }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, jobId: "job-1", status: "failed" });
    expect(mockAutoSummariser.afterTurn).not.toHaveBeenCalled();
  });

  it("only records the status of a run that isn't a task turn", async () => {
    const res = response();

    await resultHandler()({ params: { jobId: "job-1" }, body: { success: false, errorMessage: "boom" }, tenantId: "tenant-1" }, res);

    expect(mockTurnOutcomes.record).not.toHaveBeenCalled();
    expect(mockJobService.updateJobStatus).toHaveBeenCalledWith("job-1", "failed", expect.objectContaining({ errorMessage: "boom" }));
  });

  it("maps typed job delete not-found errors to 404", async () => {
    mockJobService.deleteJob.mockRejectedValue(
      new JobServiceError(
        JOB_SERVICE_ERROR_CODE.JOB_NOT_FOUND,
        "Job not found",
      ),
    );

    const handler = getRouteHandler("/:jobId", "delete");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: { jobId: "job-missing" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Job not found" });
  });

  it("maps typed auth cache overflow errors to 413", async () => {
    mockJobService.getJobStatus.mockResolvedValue({
      data: {
        tenantId: "tenant-1",
      },
    });
    mockSecretService.upsertWorkerAuthCache.mockRejectedValue(
      new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.AUTH_CACHE_TOO_LARGE,
        "Codex auth cache exceeds SSM size limit (4100 bytes)",
      ),
    );

    const handler = getRouteHandler("/:jobId/codex-auth-cache", "post");
    if (typeof handler !== "function") {
      throw new Error("Route handler was not a function");
    }

    const req = {
      params: { jobId: "job-1" },
      tenantId: "tenant-1",
      callbackTokenValidated: true,
      body: {
        secretName: "CODEX_AUTH_CACHE",
        authJson: "{\"token\":\"abc\"}",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Codex auth cache exceeds SSM size limit (4100 bytes)",
    });
  });

  it("counts a batch of session events as a heartbeat, so a long agent turn is not given up", async () => {
    const handler = getRouteHandler("/:jobId/session-events/batch", "post");
    if (typeof handler !== "function") throw new Error("Missing session events handler");
    const res = response();
    const events = [{ eventType: "reasoning", payload: { text: "Reading the code" } }];

    await handler({ params: { jobId: "job-1" }, body: { events } }, res);

    expect(mockAgentSessionWorkerEventService.batchIngest).toHaveBeenCalledWith("job-1", events);
    expect(mockTouchHeartbeat).toHaveBeenCalledWith("job-1", expect.any(Date));
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("lists what the agent did in a run after the sequence the page already has", async () => {
    const handler = getRouteHandler("/:jobId/events", "get");
    if (typeof handler !== "function") throw new Error("Missing run events handler");
    const events = [{ id: "e1", sequence: 4, eventType: "reasoning", payloadJson: { text: "Reading" } }];
    mockAgentSessionEventDAO.listByJob.mockResolvedValue(events);
    const res = response();

    await handler({ params: { jobId: "job-1" }, query: { afterSequence: "3" } }, res);

    expect(mockAgentSessionEventDAO.listByJob).toHaveBeenCalledWith("job-1", 3);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: events });
  });

  it("gives anyone who can see the run its record, and 404 for a run without one", async () => {
    const handler = getRouteHandler("/:jobId/record", "get");
    if (typeof handler !== "function") throw new Error("Missing run record handler");
    mockRunRecordGet.mockResolvedValueOnce({ jobId: "job-1" }).mockResolvedValueOnce(null);

    const found = response();
    await handler({ params: { jobId: "job-1" } }, found);
    expect(mockRunRecordGet).toHaveBeenCalledWith("job-1");
    expect(found.json).toHaveBeenCalledWith({ jobId: "job-1" });

    const missing = response();
    await handler({ params: { jobId: "job-9" } }, missing);
    expect(missing.status).toHaveBeenCalledWith(404);
  });
});
