import express from "express";
import request from "supertest";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../../../../services/errors/SetupServiceError";

const mockModelKeyService = { saveModelKey: jest.fn() };

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

jest.mock("../../../../services/setup/SetupModelKeyService", () => ({
  SetupModelKeyService: jest.fn(() => mockModelKeyService),
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
});
