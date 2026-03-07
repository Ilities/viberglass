import express from "express";
import request from "supertest";
import {
  SecretServiceError,
  SECRET_SERVICE_ERROR_CODE,
} from "../../../../services/errors/SecretServiceError";

const mockSecretService = {
  listSecrets: jest.fn(),
  getSecret: jest.fn(),
  createSecret: jest.fn(),
  updateSecret: jest.fn(),
  deleteSecret: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock("../../../../services/SecretService", () => ({
  SecretService: jest.fn(() => mockSecretService),
}));

import secretsRouter from "../../../../api/routes/secrets";

const SECRET_ID = "11111111-1111-4111-8111-111111111111";

describe("secrets routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/secrets", secretsRouter);
  });

  it("returns 400 when SecretService throws a typed client error", async () => {
    mockSecretService.createSecret.mockRejectedValue(
      new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED,
        "Secret value is required for database storage",
      ),
    );

    const response = await request(app)
      .post("/api/secrets")
      .send({
        name: "MY_SECRET",
        secretLocation: "database",
      })
      .expect(400);

    expect(response.body).toEqual({
      error: "Secret value is required for database storage",
    });
  });

  it("returns 404 when update races and secret disappears", async () => {
    mockSecretService.getSecret.mockResolvedValue({
      id: SECRET_ID,
      name: "MY_SECRET",
      secretLocation: "env",
      secretPath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSecretService.updateSecret.mockRejectedValue(
      new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_NOT_FOUND,
        "Secret not found",
      ),
    );

    const response = await request(app)
      .put(`/api/secrets/${SECRET_ID}`)
      .send({ name: "MY_RENAMED_SECRET" })
      .expect(404);

    expect(response.body).toEqual({
      error: "Secret not found",
    });
  });

  it("returns 500 for non-typed unexpected service errors", async () => {
    mockSecretService.createSecret.mockRejectedValue(new Error("boom"));

    const response = await request(app)
      .post("/api/secrets")
      .send({
        name: "MY_SECRET",
        secretLocation: "env",
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "boom",
    });
  });
});

