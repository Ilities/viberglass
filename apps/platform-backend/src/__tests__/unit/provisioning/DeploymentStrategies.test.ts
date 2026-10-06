import { availableDeploymentStrategies } from "../../../provisioning/shared/deploymentStrategies";
import { buildClanker } from "./testUtils";

const strategies = ["aws-lambda-container", "docker", "ecs", "kubernetes"].map(
  (name) => buildClanker(name).deploymentStrategy!,
);

describe("availableDeploymentStrategies", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      "AWS_EXECUTION_ENV",
      "ECS_CONTAINER_METADATA_URI_V4",
      "ECS_CONTAINER_METADATA_URI",
      "AWS_LAMBDA_FUNCTION_NAME",
      "KUBERNETES_WORKER_NAMESPACE",
    ]) {
      delete process.env[key];
    }
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults local deployments to Docker and hides unconfigured Kubernetes", () => {
    process.env.AWS_REGION = "eu-west-1";
    expect(
      availableDeploymentStrategies(strategies).map((item) => item.name),
    ).toEqual(["docker", "aws-lambda-container", "ecs"]);
  });

  it.each([
    ["AWS_EXECUTION_ENV", "AWS_ECS_FARGATE"],
    ["AWS_EXECUTION_ENV", "AWS_ECS_EC2"],
    ["AWS_EXECUTION_ENV", "AWS_Lambda_nodejs22.x"],
    ["ECS_CONTAINER_METADATA_URI_V4", "http://169.254.170.2/v4/task"],
    ["AWS_LAMBDA_FUNCTION_NAME", "platform"],
  ])("offers AWS hosting with ECS first when %s is present", (key, value) => {
    process.env[key] = value;
    expect(
      availableDeploymentStrategies(strategies).map((item) => item.name),
    ).toEqual(["ecs", "aws-lambda-container"]);
  });

  it("defaults a configured Kubernetes deployment to Kubernetes", () => {
    process.env.KUBERNETES_WORKER_NAMESPACE = "workers";
    process.env.PLATFORM_API_URL = "https://api.example.com";
    process.env.S3_BUCKET = "workers";
    process.env.KUBERNETES_WORKER_ENV_SECRET = "worker-env";
    expect(availableDeploymentStrategies(strategies)[0]?.name).toBe(
      "kubernetes",
    );
  });
});
