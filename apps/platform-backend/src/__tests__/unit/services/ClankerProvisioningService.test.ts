import type { Clanker } from "@viberglass/types";
import { ClankerProvisioningService } from "../../../services/ClankerProvisioningService";

function buildClanker(
  strategyName: string,
  deploymentConfig?: Record<string, unknown>,
): Clanker {
  return {
    id: "8c0bc2ef-4c86-48a0-8a71-91dbe58a12be",
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "4de34310-8f61-41ef-aa68-fc1693efe294",
    deploymentStrategy: {
      id: "4de34310-8f61-41ef-aa68-fc1693efe294",
      name: strategyName,
      description: null,
      configSchema: null,
      createdAt: "2026-02-17T00:00:00.000Z",
    },
    deploymentConfig: deploymentConfig ?? null,
    configFiles: [],
    agent: "claude-code",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-02-17T00:00:00.000Z",
    updatedAt: "2026-02-17T00:00:00.000Z",
  };
}

describe("ClankerProvisioningService.getProvisioningPreflightError", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VIBERATOR_ECS_EXECUTION_ROLE_ARN;
    delete process.env.VIBERATOR_ECS_TASK_ROLE_ARN;
    delete process.env.VIBERATOR_ECS_CONTAINER_IMAGE;
    delete process.env.VIBERATOR_ECS_CLUSTER_ARN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns a clear error when ECS managed config is missing", () => {
    const service = new ClankerProvisioningService();
    const clanker = buildClanker("ecs", { provisioningMode: "managed" });

    const error = service.getProvisioningPreflightError(clanker);

    expect(error).toContain(
      "ECS managed provisioning is missing required configuration",
    );
    expect(error).toContain("executionRoleArn");
    expect(error).toContain("taskRoleArn");
    expect(error).toContain("containerImage");
    expect(error).toContain("clusterArn");
  });

  it("returns null when ECS managed env defaults are available", () => {
    process.env.VIBERATOR_ECS_EXECUTION_ROLE_ARN =
      "arn:aws:iam::123456789012:role/ecs-exec";
    process.env.VIBERATOR_ECS_TASK_ROLE_ARN =
      "arn:aws:iam::123456789012:role/ecs-task";
    process.env.VIBERATOR_ECS_CONTAINER_IMAGE =
      "123456789012.dkr.ecr.eu-west-1.amazonaws.com/worker:latest";
    process.env.VIBERATOR_ECS_CLUSTER_ARN =
      "arn:aws:ecs:eu-west-1:123456789012:cluster/worker-cluster";

    const service = new ClankerProvisioningService();
    const clanker = buildClanker("ecs", { provisioningMode: "managed" });

    const error = service.getProvisioningPreflightError(clanker);

    expect(error).toBeNull();
  });

  it("returns a clear error when ECS pre-built mode is missing taskDefinitionArn", () => {
    const service = new ClankerProvisioningService();
    const clanker = buildClanker("ecs", {
      provisioningMode: "prebuilt",
      clusterArn: "arn:aws:ecs:eu-west-1:123456789012:cluster/worker-cluster",
    });

    const error = service.getProvisioningPreflightError(clanker);

    expect(error).toBe("ECS pre-built mode requires taskDefinitionArn.");
  });

  it("returns null for non-ECS strategies", () => {
    const service = new ClankerProvisioningService();
    const clanker = buildClanker("docker", {});

    const error = service.getProvisioningPreflightError(clanker);

    expect(error).toBeNull();
  });
});
