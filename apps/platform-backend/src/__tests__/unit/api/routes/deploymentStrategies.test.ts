import express from "express";
import request from "supertest";
import type { DeploymentStrategy } from "@viberglass/types";

const mockList = jest.fn<Promise<DeploymentStrategy[]>, []>();
jest.mock("../../../../persistence/clanker/DeploymentStrategyDAO", () => ({
  DeploymentStrategyDAO: jest.fn(() => ({
    listDeploymentStrategies: mockList,
  })),
}));
jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));
import router from "../../../../api/routes/deployment-strategies";

const app = express();
app.use("/api/deployment-strategies", router);
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
  for (const key of [
    "AWS_EXECUTION_ENV",
    "ECS_CONTAINER_METADATA_URI_V4",
    "ECS_CONTAINER_METADATA_URI",
    "AWS_LAMBDA_FUNCTION_NAME",
    "KUBERNETES_WORKER_NAMESPACE",
  ])
    delete process.env[key];
  mockList.mockResolvedValue(
    ["aws-lambda-container", "docker", "ecs", "kubernetes"].map((name) => ({
      id: name,
      name,
      description: null,
      configSchema: null,
      createdAt: "",
    })),
  );
});
afterAll(() => {
  process.env = originalEnv;
});

it("serves only AWS hosting options with ECS first on Fargate", async () => {
  process.env.AWS_EXECUTION_ENV = "AWS_ECS_FARGATE";
  const response = await request(app)
    .get("/api/deployment-strategies")
    .expect(200);
  expect(response.body).toEqual({
    success: true,
    data: [
      expect.objectContaining({ name: "ecs" }),
      expect.objectContaining({ name: "aws-lambda-container" }),
    ],
  });
});

it("serves Docker first on a local deployment", async () => {
  const response = await request(app)
    .get("/api/deployment-strategies")
    .expect(200);
  expect(response.body.data).toEqual([
    expect.objectContaining({ name: "docker" }),
    expect.objectContaining({ name: "aws-lambda-container" }),
    expect.objectContaining({ name: "ecs" }),
  ]);
});
