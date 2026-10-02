const mockJobService = {
  getJobStatus: jest.fn(),
  updateJobStatus: jest.fn(),
  deleteJob: jest.fn(),
};

const mockTurnOutcomes = {
  record: jest.fn(),
};
const mockAutoSummariser = { afterTurn: jest.fn() };

const mockSecretService = {
  upsertWorkerAuthCache: jest.fn(),
};

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
};

const mockAgentPendingRequestDAO = {};

const mockAgentSessionWorkerEventService = {
  batchIngest: jest.fn(),
};

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

jest.mock("../../../../services/SecretService", () => ({
  SecretService: jest.fn(() => mockSecretService),
}));

jest.mock("../../../../services/taskTurns/TaskAutoSummariser", () => ({
  TaskAutoSummariser: jest.fn(() => mockAutoSummariser),
}));

jest.mock("../../../../services/taskTurns/TaskTurnService", () => ({
  TaskTurnService: jest.fn(() => ({})),
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
    mockAgentTurnDAO.getByJobId.mockResolvedValue(null);
    mockAgentSessionDAO.listByLastJobId.mockResolvedValue([]);
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
});
