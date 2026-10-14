import type { Request, Response, NextFunction } from "express";

const mockClankerDAO = {
  getClanker: jest.fn(),
  createClanker: jest.fn(),
  updateClanker: jest.fn(),
  validateSecretsExist: jest.fn(),
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

jest.mock("../../../../provisioning/provisioningFactory", () => ({
  getClankerProvisioner: jest.fn(() => ({})),
}));

jest.mock("../../../../services/modelEndpoints", () => ({
  modelEndpoints: { validateSelection: jest.fn(async () => undefined) },
}));

jest.mock("../../../../provisioning/shared/sourceBuild", () => ({
  ...jest.requireActual("../../../../provisioning/shared/sourceBuild"),
  canBuildWorkerFromSource: () => false,
}));

import clankersRouter from "../../../../api/routes/clankers";
import { SOURCE_BUILD_UNAVAILABLE_MESSAGE } from "../../../../provisioning/shared/sourceBuild";

function routeHandler(method: "post" | "put", routePath: string): (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown {
  const stack: unknown = Reflect.get(clankersRouter, "stack");
  if (!Array.isArray(stack)) throw new Error("Router stack not available");
  const layer = stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method] === true);
  const handle: unknown = layer?.route?.stack.at(-1)?.handle;
  if (typeof handle !== "function") throw new Error(`Route not found: ${method} ${routePath}`);
  return (req, res, next) => handle(req, res, next);
}

function dockerConfig(provisioningMode: "managed" | "prebuilt") {
  return { version: 1, strategy: { type: "docker", provisioningMode }, agent: { type: "claude-code" } };
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

describe("clankers routes on a backend without a source checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClankerDAO.getClanker.mockResolvedValue({ id: "id", agent: "claude-code", modelEndpoint: null });
  });

  it("rejects creating a runner that builds its image from source", async () => {
    const error = await call("post", "/", { deploymentConfig: dockerConfig("managed") });

    expect(error).toMatchObject({ statusCode: 400, message: SOURCE_BUILD_UNAVAILABLE_MESSAGE });
    expect(mockClankerDAO.createClanker).not.toHaveBeenCalled();
  });

  it("rejects updating a runner to build its image from source", async () => {
    const error = await call("put", "/:id", { deploymentConfig: dockerConfig("managed") });

    expect(error).toMatchObject({ statusCode: 400, message: SOURCE_BUILD_UNAVAILABLE_MESSAGE });
    expect(mockClankerDAO.updateClanker).not.toHaveBeenCalled();
  });

  it("creates a runner on a published image", async () => {
    mockClankerDAO.createClanker.mockResolvedValue({ id: "id" });

    const error = await call("post", "/", { deploymentConfig: dockerConfig("prebuilt") });

    expect(error).toBeUndefined();
    expect(mockClankerDAO.createClanker).toHaveBeenCalled();
  });
});
