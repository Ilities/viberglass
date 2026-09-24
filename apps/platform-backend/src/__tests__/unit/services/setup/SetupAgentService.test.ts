import type {
  Clanker,
  ClankerStatus,
  CreateClankerRequest,
  DeploymentStrategy,
  UpdateClankerRequest,
} from "@viberglass/types";
import { SetupAgentService } from "../../../../services/setup/SetupAgentService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({ ClankerDAO: jest.fn() }));
jest.mock("../../../../persistence/clanker/DeploymentStrategyDAO", () => ({ DeploymentStrategyDAO: jest.fn() }));
jest.mock("../../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));
jest.mock("../../../../provisioning/provisioningFactory", () => ({ getClankerProvisioner: jest.fn() }));
jest.mock("../../../../services/ClankerStartService", () => ({ ClankerStartService: jest.fn() }));

function strategy(name: string): DeploymentStrategy {
  return { id: `${name}-id`, name, description: null, configSchema: null, createdAt: "" };
}

function runner(request: CreateClankerRequest | UpdateClankerRequest, status: ClankerStatus = "inactive"): Clanker {
  return {
    id: "clanker-1",
    name: "Default agent",
    slug: "default-agent",
    description: null,
    deploymentStrategyId: request.deploymentStrategyId ?? null,
    deploymentStrategy: null,
    deploymentConfig: request.deploymentConfig ?? null,
    configFiles: [],
    agent: request.agent ?? "claude-code",
    secretIds: request.secretIds ?? [],
    status,
    statusMessage: null,
    createdAt: "",
    updatedAt: "",
  };
}

function build(options: { ecsReady?: boolean; existing?: Clanker | null; secret?: boolean } = {}) {
  const getClankerBySlug = jest.fn(async (_slug: string) => options.existing ?? null);
  const createClanker = jest.fn(async (request: CreateClankerRequest) => runner(request));
  const updateClanker = jest.fn(async (_id: string, request: UpdateClankerRequest) => runner(request));
  const getDeploymentStrategyByName = jest.fn(async (name: string) => strategy(name));
  const getSecretByName = jest.fn(async (_name: string) => (options.secret === false ? null : { id: "secret-1" }));
  const getProvisioningPreflightError = jest.fn((_c: Clanker) =>
    options.ecsReady ? null : "ECS managed provisioning is missing required configuration",
  );
  const start = jest.fn(async (clanker: Clanker) => ({ clanker: { ...clanker, status: "deploying" as const } }));
  const service = new SetupAgentService(
    { getClankerBySlug, createClanker, updateClanker },
    { getDeploymentStrategyByName },
    { getSecretByName },
    { getProvisioningPreflightError },
    { start },
  );
  return { service, createClanker, updateClanker, getSecretByName, start };
}

describe("SetupAgentService", () => {
  it("creates the default agent on local Docker with the key and the binding's model", async () => {
    const { service, createClanker, getSecretByName, start } = build();

    const agent = await service.prepareDefaultAgent("opencode-go");

    expect(getSecretByName).toHaveBeenCalledWith("OPENCODE_API_KEY");
    expect(createClanker).toHaveBeenCalledWith({
      name: "Default agent",
      description: "Runs OpenCode with your OpenCode Go key. Created by setup.",
      deploymentStrategyId: "docker-id",
      deploymentConfig: {
        version: 1,
        strategy: { type: "docker", provisioningMode: "prebuilt" },
        agent: { type: "opencode", model: "opencode-go/deepseek-v4.1-flash" },
      },
      agent: "opencode",
      secretIds: ["secret-1"],
    });
    expect(start).toHaveBeenCalled();
    expect(agent).toMatchObject({ slug: "default-agent", agentName: "OpenCode", compute: "docker", status: "deploying" });
  });

  it("runs on ECS when the instance has the stack's ECS settings", async () => {
    const { service, createClanker } = build({ ecsReady: true });

    const agent = await service.prepareDefaultAgent("anthropic");

    expect(createClanker).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentStrategyId: "ecs-id",
        deploymentConfig: expect.objectContaining({ strategy: { type: "ecs", provisioningMode: "managed" } }),
      }),
    );
    expect(agent.compute).toBe("ecs");
  });

  it("carries the binding's endpoint, for Moonshot keys on Kimi", async () => {
    const { service, createClanker } = build();

    await service.prepareDefaultAgent("moonshotai");

    expect(createClanker).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentConfig: expect.objectContaining({
          agent: { type: "kimi-code", model: "kimi-k3", endpoint: "https://api.moonshot.ai/v1" },
        }),
      }),
    );
  });

  it("leaves a running default agent alone when nothing changed", async () => {
    const first = build();
    await first.service.prepareDefaultAgent("anthropic");
    const created = runner(first.createClanker.mock.calls[0][0], "active");

    const { service, updateClanker, start } = build({ existing: created });
    const agent = await service.prepareDefaultAgent("anthropic");

    expect(updateClanker).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(agent.status).toBe("active");
  });

  it("reconfigures and restarts it for another provider", async () => {
    const first = build();
    await first.service.prepareDefaultAgent("anthropic");
    const existing = runner(first.createClanker.mock.calls[0][0], "active");

    const { service, updateClanker, start } = build({ existing });
    await service.prepareDefaultAgent("opencode-go");

    expect(updateClanker).toHaveBeenCalledWith(
      "clanker-1",
      expect.objectContaining({ agent: "opencode", status: "inactive", statusMessage: null }),
    );
    expect(start).toHaveBeenCalled();
  });

  it("retries a default agent that failed to start", async () => {
    const first = build();
    await first.service.prepareDefaultAgent("anthropic");
    const failed = runner(first.createClanker.mock.calls[0][0], "failed");

    const { service, start } = build({ existing: failed });
    await service.prepareDefaultAgent("anthropic");

    expect(start).toHaveBeenCalled();
  });

  it("needs the model key first", async () => {
    const { service, createClanker } = build({ secret: false });

    await expect(service.prepareDefaultAgent("anthropic")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING,
      message: "Connect your Anthropic key first, so the agent has something to run with.",
    });
    expect(createClanker).not.toHaveBeenCalled();
  });
});
