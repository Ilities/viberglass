import type { EcsClientPort } from "../../../provisioning/ports/EcsClientPort";
import { EcsProvisioningHandler } from "../../../provisioning/strategies/EcsProvisioningHandler";
import { buildClanker } from "./testUtils";

describe("EcsProvisioningHandler", () => {
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

  function buildEcsClient(): {
    client: EcsClientPort;
    describeTaskDefinition: jest.Mock;
    registerTaskDefinition: jest.Mock;
  } {
    const describeTaskDefinition = jest.fn(async () => ({
      taskDefinitionArn: "arn:aws:ecs:region:1:task-definition/test:1",
    }));
    const registerTaskDefinition = jest.fn(async () => ({
      taskDefinitionArn: "arn:aws:ecs:region:1:task-definition/test:2",
      family: "viberator-worker-test",
      containerDefinitions: [{ name: "worker", image: "worker:latest" }],
    }));

    const client: EcsClientPort = {
      describeTaskDefinition,
      registerTaskDefinition,
    };

    return { client, describeTaskDefinition, registerTaskDefinition };
  }

  it("returns a clear error when ECS managed config is missing", () => {
    const { client } = buildEcsClient();
    const handler = new EcsProvisioningHandler(client);

    const error = handler.getPreflightError(
      buildClanker("ecs", {
        version: 1,
        strategy: {
          type: "ecs",
          provisioningMode: "managed",
        },
        agent: { type: "claude-code" },
      }),
    );

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

    const { client } = buildEcsClient();
    const handler = new EcsProvisioningHandler(client);

    const error = handler.getPreflightError(
      buildClanker("ecs", {
        version: 1,
        strategy: {
          type: "ecs",
          provisioningMode: "managed",
        },
        agent: { type: "claude-code" },
      }),
    );

    expect(error).toBeNull();
  });

  it("returns a clear error when ECS pre-built mode is missing taskDefinitionArn", () => {
    const { client } = buildEcsClient();
    const handler = new EcsProvisioningHandler(client);

    const error = handler.getPreflightError(
      buildClanker("ecs", {
        version: 1,
        strategy: {
          type: "ecs",
          provisioningMode: "prebuilt",
          clusterArn: "arn:aws:ecs:eu-west-1:123456789012:cluster/worker-cluster",
        },
        agent: { type: "claude-code" },
      }),
    );

    expect(error).toBe("ECS pre-built mode requires taskDefinitionArn.");
  });

  it("provisions ECS task definition and returns active status", async () => {
    const { client, registerTaskDefinition } = buildEcsClient();
    const handler = new EcsProvisioningHandler(client);

    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: {
        type: "ecs",
        executionRoleArn: "arn:exec",
        taskRoleArn: "arn:task",
        containerImage: "worker:latest",
        clusterArn: "arn:cluster",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.provision(clanker);

    expect(registerTaskDefinition).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("active");
    expect(result.statusMessage).toContain("ECS task definition ready");
    expect(result.deploymentConfig).toBeTruthy();
  });

  it("returns inactive when task definition is missing", async () => {
    const { client } = buildEcsClient();
    const handler = new EcsProvisioningHandler(client);

    const result = await handler.checkAvailability(buildClanker("ecs", null));

    expect(result).toEqual({
      status: "inactive",
      statusMessage: "ECS task definition not configured",
    });
  });

  it("returns inactive when task definition does not exist", async () => {
    const { client, describeTaskDefinition } = buildEcsClient();
    describeTaskDefinition.mockRejectedValue({ name: "ClientException" });

    const handler = new EcsProvisioningHandler(client);
    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: {
        type: "ecs",
        taskDefinitionArn: "arn:missing",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);

    expect(result).toEqual({
      status: "inactive",
      statusMessage: "ECS task definition not found",
    });
  });

  it("returns failed when ECS check throws non-client exception", async () => {
    const { client, describeTaskDefinition } = buildEcsClient();
    describeTaskDefinition.mockRejectedValue(new Error("network down"));

    const handler = new EcsProvisioningHandler(client);
    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: {
        type: "ecs",
        taskDefinitionArn: "arn:present",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);

    expect(result.status).toBe("failed");
    expect(result.statusMessage).toContain("network down");
  });
});
