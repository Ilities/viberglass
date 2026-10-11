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

const mockListUses = jest.fn();
jest.mock("../../../../persistence/secret/SecretUsageDAO", () => ({
  SecretUsageDAO: jest.fn(() => ({ listUses: mockListUses })),
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

  it("lists the spaces and connections that read each secret", async () => {
    const uses = [
      { secretId: SECRET_ID, kind: "space", name: "Web shop" },
      { secretId: SECRET_ID, kind: "connection", name: "GitHub" },
    ];
    mockListUses.mockResolvedValue(uses);

    const response = await request(app).get("/api/secrets/usage").expect(200);

    expect(response.body.data).toEqual(uses);
    expect(mockSecretService.getSecret).not.toHaveBeenCalled();
  });

  it("reports SSM as the default store when agents run on ECS", async () => {
    const previous = { ...process.env };
    process.env.VIBERATOR_ECS_CLUSTER_ARN = "arn:aws:ecs:eu-west-1:1:cluster/agents";
    process.env.SECRETS_SSM_PREFIX = "/acme/secrets/";
    try {
      const response = await request(app).get("/api/secrets/storage-defaults").expect(200);
      expect(response.body.data).toEqual({ location: "ssm", ssmPrefix: "/acme/secrets" });
    } finally {
      process.env = previous;
    }
  });

  it("reports the database as the default store otherwise", async () => {
    const previous = { ...process.env };
    delete process.env.VIBERATOR_ECS_CLUSTER_ARN;
    delete process.env.SECRETS_SSM_PREFIX;
    try {
      const response = await request(app).get("/api/secrets/storage-defaults").expect(200);
      expect(response.body.data).toEqual({ location: "database", ssmPrefix: "/viberator/secrets" });
    } finally {
      process.env = previous;
    }
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

