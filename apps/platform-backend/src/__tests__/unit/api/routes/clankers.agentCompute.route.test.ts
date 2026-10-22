import type { Request, Response, NextFunction } from "express";
import { agentStrategyUnsupportedReason } from "@viberglass/types";

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

function lambdaConfig(agent: string) {
  return { version: 1, strategy: { type: "lambda" }, agent: { type: agent } };
}

const CODEX_ON_LAMBDA = agentStrategyUnsupportedReason("codex", "lambda");

describe("clankers routes for a harness that can't run on Lambda", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClankerDAO.createClanker.mockResolvedValue({ id: "id" });
    mockClankerDAO.updateClanker.mockResolvedValue({ id: "id" });
    mockStrategyDAO.getDeploymentStrategy.mockResolvedValue({ id: "lambda-id", name: "lambda" });
  });

  it("names Codex as a harness that can't run on Lambda", () => {
    expect(CODEX_ON_LAMBDA).toContain("Lambda");
    expect(agentStrategyUnsupportedReason("codex", "ecs")).toBeNull();
    expect(agentStrategyUnsupportedReason("claude-code", "lambda")).toBeNull();
  });

  it("rejects creating a Codex runner on Lambda", async () => {
    const error = await call("post", "/", { agent: "codex", deploymentConfig: lambdaConfig("codex") });

    expect(error).toMatchObject({ statusCode: 400, message: CODEX_ON_LAMBDA });
    expect(mockClankerDAO.createClanker).not.toHaveBeenCalled();
  });

  it("rejects it by the chosen strategy when the runner has no config yet", async () => {
    const error = await call("post", "/", { agent: "codex", deploymentStrategyId: "lambda-id" });

    expect(error).toMatchObject({ statusCode: 400, message: CODEX_ON_LAMBDA });
    expect(mockStrategyDAO.getDeploymentStrategy).toHaveBeenCalledWith("lambda-id");
  });

  it("rejects switching a Lambda runner's harness to Codex", async () => {
    mockClankerDAO.getClanker.mockResolvedValue({
      id: "id",
      agent: "claude-code",
      deploymentStrategyId: "lambda-id",
      deploymentConfig: lambdaConfig("claude-code"),
      modelEndpoint: null,
    });

    const error = await call("put", "/:id", { agent: "codex" });

    expect(error).toMatchObject({ statusCode: 400, message: CODEX_ON_LAMBDA });
    expect(mockClankerDAO.updateClanker).not.toHaveBeenCalled();
  });

  it("creates harnesses that run on Lambda there", async () => {
    const error = await call("post", "/", { agent: "claude-code", deploymentConfig: lambdaConfig("claude-code") });

    expect(error).toBeUndefined();
    expect(mockClankerDAO.createClanker).toHaveBeenCalled();
  });
});
