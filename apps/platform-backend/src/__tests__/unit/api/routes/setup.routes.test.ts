import express from "express";
import request from "supertest";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../../../../services/errors/SetupServiceError";

const mockModelKeyService = { saveModelKey: jest.fn() };
const mockRepositoryService = { saveRepository: jest.fn() };
const mockSpaceService = { createSpace: jest.fn() };

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

jest.mock("../../../../services/setup/SetupModelKeyService", () => ({
  SetupModelKeyService: jest.fn(() => mockModelKeyService),
}));

jest.mock("../../../../services/setup/SetupRepositoryService", () => ({
  SetupRepositoryService: jest.fn(() => mockRepositoryService),
}));

jest.mock("../../../../services/setup/SetupSpaceService", () => ({
  SetupSpaceService: jest.fn(() => mockSpaceService),
}));

import setupRouter from "../../../../api/routes/setup";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";

describe("setup routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/setup", setupRouter);
    app.use(applicationErrorHandler);
  });

  it("lists providers with the agent each key runs on", async () => {
    const response = await request(app).get("/api/setup/providers").expect(200);

    expect(response.body.data).toContainEqual(
      expect.objectContaining({
        id: "opencode-go",
        displayName: "OpenCode Go",
        keyUrl: "https://opencode.ai/auth",
        agent: "opencode",
        agentName: "OpenCode",
      }),
    );
    expect(response.body.data.map((provider: { id: string }) => provider.id)).not.toContain("fake");
  });

  it("saves a model key", async () => {
    mockModelKeyService.saveModelKey.mockResolvedValue({ provider: "anthropic" });

    await request(app)
      .post("/api/setup/model-key")
      .send({ provider: "anthropic", key: "sk-ant-abc" })
      .expect(200, { success: true, data: { provider: "anthropic" } });
    expect(mockModelKeyService.saveModelKey).toHaveBeenCalledWith("anthropic", "sk-ant-abc");
  });

  it("refuses an unknown provider", async () => {
    await request(app)
      .post("/api/setup/model-key")
      .send({ provider: "acme", key: "abc" })
      .expect(400);
    expect(mockModelKeyService.saveModelKey).not.toHaveBeenCalled();
  });

  it("returns the plain-language reason when the key is rejected", async () => {
    mockModelKeyService.saveModelKey.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "Anthropic rejected this key."),
    );

    await request(app)
      .post("/api/setup/model-key")
      .send({ provider: "anthropic", key: "sk-ant-abc" })
      .expect(422, { error: "Anthropic rejected this key.", code: "KEY_REJECTED" });
  });

  it("saves a repository and its token", async () => {
    mockRepositoryService.saveRepository.mockResolvedValue({ fullName: "acme/web" });

    await request(app)
      .post("/api/setup/repository")
      .send({ repository: "acme/web", token: "ghp_abc" })
      .expect(200, { success: true, data: { fullName: "acme/web" } });
    expect(mockRepositoryService.saveRepository).toHaveBeenCalledWith("acme/web", "ghp_abc");
  });

  it("returns why the token can't be used", async () => {
    mockRepositoryService.saveRepository.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.REPOSITORY_READ_ONLY, "This token can read acme/web but can't push to it."),
    );

    await request(app)
      .post("/api/setup/repository")
      .send({ repository: "acme/web", token: "ghp_abc" })
      .expect(422, {
        error: "This token can read acme/web but can't push to it.",
        code: "REPOSITORY_READ_ONLY",
      });
  });

  it("requires a token", async () => {
    await request(app).post("/api/setup/repository").send({ repository: "acme/web" }).expect(400);
    expect(mockRepositoryService.saveRepository).not.toHaveBeenCalled();
  });

  it("creates the first space", async () => {
    mockSpaceService.createSpace.mockResolvedValue({ slug: "web" });

    await request(app)
      .post("/api/setup/space")
      .send({ name: "Web", repository: "https://github.com/acme/web", baseBranch: "main" })
      .expect(201, { success: true, data: { slug: "web" } });
    expect(mockSpaceService.createSpace).toHaveBeenCalledWith({
      name: "Web",
      repository: "https://github.com/acme/web",
      baseBranch: "main",
    });
  });

  it("says when the space name is taken", async () => {
    mockSpaceService.createSpace.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS, 'There\'s already a space called "Web".'),
    );

    await request(app)
      .post("/api/setup/space")
      .send({ name: "Web", repository: "acme/web" })
      .expect(409, { error: 'There\'s already a space called "Web".', code: "SPACE_EXISTS" });
  });
});
