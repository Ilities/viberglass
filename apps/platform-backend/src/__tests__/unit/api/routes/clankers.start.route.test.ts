import type express from "express";
import type { Clanker } from "@viberglass/types";

const mockClankerDAO = {
  getClanker: jest.fn(),
  updateStatus: jest.fn(),
  updateClanker: jest.fn(),
  listClankers: jest.fn(),
  getClankerBySlug: jest.fn(),
  createClanker: jest.fn(),
  validateSecretsExist: jest.fn(),
  deleteClanker: jest.fn(),
  getConfigFiles: jest.fn(),
  getConfigFile: jest.fn(),
  deleteConfigFile: jest.fn(),
};

const mockProvisioner = {
  getProvisioningPreflightError: jest.fn(),
  provision: jest.fn(),
  resolveAvailabilityStatus: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock("../../../../api/middleware/validation", () => {
  const passThrough = (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next();

  return {
    validateCreateClanker: passThrough,
    validateUpdateClanker: passThrough,
    validateUuidParam: () => passThrough,
  };
});

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({
  ClankerDAO: jest.fn(() => mockClankerDAO),
}));

jest.mock("../../../../services/ClankerHealthService", () => ({
  ClankerHealthService: jest.fn(() => ({
    checkClankerHealth: jest.fn(),
  })),
}));

jest.mock("../../../../provisioning/provisioningFactory", () => ({
  getClankerProvisioner: jest.fn(() => mockProvisioner),
}));

import clankersRouter from "../../../../api/routes/clankers";

const CLANKER_ID = "11111111-1111-4111-8111-111111111111";

function buildClanker(): Clanker {
  return {
    id: CLANKER_ID,
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "22222222-2222-4222-8222-222222222222",
    deploymentStrategy: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "docker",
      description: null,
      configSchema: null,
      createdAt: "2026-02-20T00:00:00.000Z",
    },
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
  };
}

function getStartRouteHandler(): unknown {
  const stackValue = Reflect.get(clankersRouter, "stack");
  if (!Array.isArray(stackValue)) {
    throw new Error("Router stack not available");
  }

  const routeLayer = stackValue.find(
    (entry: any) =>
      entry.route &&
      entry.route.path === "/:id/start" &&
      entry.route.methods?.post === true,
  );

  if (!routeLayer) {
    throw new Error("Route not found: POST /:id/start");
  }

  const route = routeLayer.route;
  if (!route || !Array.isArray(route.stack) || route.stack.length === 0) {
    throw new Error("Route stack for POST /:id/start is empty");
  }

  const handle = Reflect.get(route.stack[route.stack.length - 1], "handle");
  if (typeof handle !== "function") {
    throw new Error("Route handler for POST /:id/start is not a function");
  }

  return handle;
}

async function invokeStartHandler(
  handler: unknown,
  req: unknown,
  res: unknown,
): Promise<void> {
  if (typeof handler !== "function") {
    throw new Error("Start route handler is not callable");
  }

  await handler(req, res, () => undefined);
}

function createMockResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.send.mockReturnValue(response);

  return response;
}

describe("clankers start route provisioning wiring", () => {
  const startHandler = getStartRouteHandler();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when preflight fails", async () => {
    const req = { params: { id: CLANKER_ID }, body: {} };
    const res = createMockResponse();

    mockClankerDAO.getClanker.mockResolvedValue(buildClanker());
    mockProvisioner.getProvisioningPreflightError.mockReturnValue(
      "missing executionRoleArn",
    );

    await invokeStartHandler(startHandler, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Provisioning configuration error",
      message: "missing executionRoleArn",
    });
    expect(mockClankerDAO.updateStatus).not.toHaveBeenCalled();
    expect(mockProvisioner.provision).not.toHaveBeenCalled();
  });

  it("keeps async start status semantics and persists provisioned config", async () => {
    const req = { params: { id: CLANKER_ID }, body: {} };
    const res = createMockResponse();

    const clanker = buildClanker();
    const deployingClanker: Clanker = {
      ...clanker,
      status: "deploying",
      statusMessage: "Starting clanker...",
    };

    mockClankerDAO.getClanker.mockResolvedValue(clanker);
    mockClankerDAO.updateStatus.mockResolvedValue(deployingClanker);
    mockProvisioner.getProvisioningPreflightError.mockReturnValue(null);
    mockProvisioner.provision.mockImplementation(
      async (
        _provisioningClanker: Clanker,
        progress?: (statusMessage: string) => Promise<void> | void,
      ) => {
        if (progress) {
          await progress("Registering ECS task definition...");
        }

        return {
          deploymentConfig: {
            version: 1,
            strategy: {
              type: "docker",
              containerImage: "worker:latest",
            },
            agent: { type: "claude-code" },
          },
          status: "active",
          statusMessage: "Docker image ready: worker:latest",
        };
      },
    );

    await invokeStartHandler(startHandler, req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: deployingClanker,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockClankerDAO.updateStatus).toHaveBeenCalledWith(
      CLANKER_ID,
      "deploying",
      "Starting clanker...",
    );
    expect(mockClankerDAO.updateStatus).toHaveBeenCalledWith(
      CLANKER_ID,
      "deploying",
      "Registering ECS task definition...",
    );
    expect(mockClankerDAO.updateClanker).toHaveBeenCalledWith(CLANKER_ID, {
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
          containerImage: "worker:latest",
        },
        agent: { type: "claude-code" },
      },
      status: "active",
      statusMessage: "Docker image ready: worker:latest",
    });
  });
});
