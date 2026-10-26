import type { Request, Response, NextFunction } from "express";

const mockClankerDAO = {
  getClanker: jest.fn(),
  createClanker: jest.fn(),
  updateClanker: jest.fn(),
  validateSecretsExist: jest.fn(),
};

const mockStrategyDAO = {
  getDeploymentStrategy: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock("../../../../api/middleware/validation", () => {
  const passThrough = (_req: Request, _res: Response, next: NextFunction) => next();
  return {
    validateCreateClanker: passThrough,
    validateUpdateClanker: passThrough,
    validateUuidParam: () => passThrough,
  };
});

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({
  ClankerDAO: jest.fn(() => mockClankerDAO),
}));

jest.mock("../../../../persistence/clanker/DeploymentStrategyDAO", () => ({
  DeploymentStrategyDAO: jest.fn(() => mockStrategyDAO),
}));

jest.mock("../../../../provisioning/provisioningFactory", () => ({
  getClankerProvisioner: jest.fn(() => ({})),
}));

jest.mock("../../../../services/modelEndpoints", () => ({
  modelEndpoints: { validateSelection: jest.fn(async () => undefined) },
}));

import clankersRouter from "../../../../api/routes/clankers";

function routeHandler(method: "post" | "put", routePath: string): (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown {
  const stack: unknown = Reflect.get(clankersRouter, "stack");
  if (!Array.isArray(stack)) throw new Error("Router stack not available");
  const layer = stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method] === true);
  const handle: unknown = layer?.route?.stack.at(-1)?.handle;
  if (typeof handle !== "function") throw new Error(`Route not found: ${method} ${routePath}`);
  return (req, res, next) => handle(req, res, next);
}

async function call(method: "post" | "put", routePath: string, body: Record<string, unknown>): Promise<unknown> {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  let error: unknown;
  await routeHandler(method, routePath)({ params: { id: "id" }, body }, res, (err) => {
    error = err;
  });
  return error;
}

function ecsConfig(strategy: Record<string, unknown>, runtime?: Record<string, unknown>) {
  return { version: 1, strategy: { type: "ecs", provisioningMode: "managed", ...strategy }, agent: { type: "opencode" }, ...(runtime ? { runtime } : {}) };
}

describe("clankers routes checking a runner's size and time limit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClankerDAO.createClanker.mockResolvedValue({ id: "id" });
    mockStrategyDAO.getDeploymentStrategy.mockResolvedValue({ id: "ecs-id", name: "ecs" });
  });

  it("saves a size Fargate runs and a whole-minute time limit", async () => {
    const error = await call("post", "/", { name: "r", deploymentConfig: ecsConfig({ cpu: "2048", memory: "8192" }, { settings: { maxExecutionTime: 5400 } }) });
    expect(error).toBeUndefined();
    expect(mockClankerDAO.createClanker).toHaveBeenCalled();
  });

  it("refuses memory Fargate doesn't offer with the CPU", async () => {
    const error = await call("post", "/", { name: "r", deploymentConfig: ecsConfig({ cpu: "1024", memory: "16384" }) });
    expect(error).toMatchObject({ message: "ECS can't run 16384 MiB of memory with 1024 CPU units." });
    expect(mockClankerDAO.createClanker).not.toHaveBeenCalled();
  });

  it("refuses CPU without memory", async () => {
    const error = await call("post", "/", { name: "r", deploymentConfig: ecsConfig({ cpu: "2048" }) });
    expect(error).toMatchObject({ message: "Set both CPU and memory for an ECS runner, or neither." });
  });

  it("refuses a time limit that isn't a positive whole number", async () => {
    const error = await call("post", "/", { name: "r", deploymentConfig: ecsConfig({}, { settings: { maxExecutionTime: -60 } }) });
    expect(error).toMatchObject({ message: "The time limit must be a whole number of minutes above zero." });
  });
});
