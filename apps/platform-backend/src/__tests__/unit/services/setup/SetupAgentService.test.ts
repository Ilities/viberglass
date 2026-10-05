import type {
  Clanker,
  ClankerStatus,
  CreateClankerRequest,
  DeploymentStrategy,
  ModelEndpoint,
  ModelProviderId,
  UpdateClankerRequest,
} from "@viberglass/types";
import { SetupAgentService } from "../../../../services/setup/SetupAgentService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({ ClankerDAO: jest.fn() }));
jest.mock("../../../../persistence/clanker/DeploymentStrategyDAO", () => ({ DeploymentStrategyDAO: jest.fn() }));
jest.mock("../../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));
jest.mock("../../../../provisioning/provisioningFactory", () => ({ getClankerProvisioner: jest.fn() }));
jest.mock("../../../../services/ClankerStartService", () => ({ ClankerStartService: jest.fn() }));
jest.mock("../../../../persistence/modelEndpoint/ModelEndpointDAO", () => ({ ModelEndpointDAO: jest.fn() }));

const ZAI: ModelEndpoint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "z.ai",
  baseUrl: "https://api.z.ai/api/paas/v4",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  secretId: "endpoint-key",
  extraHeaders: {},
  models: ["glm-4.7-flash"],
  mayColdStart: false,
  source: "manual",
  deploymentId: null,
  createdAt: "",
  updatedAt: "",
};

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
    secretBindings: request.secretBindings ?? [],
    mcpServerIds: [],
    skillIds: [],
    status,
    statusMessage: null,
    createdAt: "",
    updatedAt: "",
  };
}

function build(options: { ecsReady?: boolean; existing?: Clanker | null; secret?: boolean; endpoint?: ModelEndpoint | null } = {}) {
  const getClankerBySlug = jest.fn(async (_slug: string) => options.existing ?? null);
  const createClanker = jest.fn(async (request: CreateClankerRequest) => runner(request));
  const updateClanker = jest.fn(async (_id: string, request: UpdateClankerRequest) => runner(request));
  const getDeploymentStrategyByName = jest.fn(async (name: string) => strategy(name));
  const getLatestSecretForProvider = jest.fn(async (_provider: ModelProviderId) =>
    options.secret === false ? null : { id: "secret-1" },
  );
  const getProvisioningPreflightError = jest.fn((_c: Clanker) =>
    options.ecsReady ? null : "ECS managed provisioning is missing required configuration",
  );
  const start = jest.fn(async (clanker: Clanker) => ({ clanker: { ...clanker, status: "deploying" as const } }));
  const service = new SetupAgentService(
    { getClankerBySlug, createClanker, updateClanker },
    { getDeploymentStrategyByName },
    { getLatestSecretForProvider },
    { getProvisioningPreflightError },
    { start },
    { get: async (id: string) => (options.endpoint?.id === id ? options.endpoint : null) },
  );
  return { service, createClanker, updateClanker, getLatestSecretForProvider, start };
}

describe("SetupAgentService", () => {
  it("creates the default agent on local Docker with the key and the binding's model", async () => {
    const { service, createClanker, getLatestSecretForProvider, start } = build();

    const agent = await service.prepareDefaultAgent({ provider: "opencode-go" });

    expect(getLatestSecretForProvider).toHaveBeenCalledWith("opencode-go");
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
      // A key-backed default agent drops any endpoint it ran on before.
      modelEndpoint: null,
      secretBindings: [{ envVar: "OPENCODE_API_KEY", secretId: "secret-1" }],
    });
    expect(start).toHaveBeenCalled();
    expect(agent).toMatchObject({ slug: "default-agent", agentName: "OpenCode", compute: "docker", status: "deploying" });
  });

  it("runs on ECS when the instance has the stack's ECS settings", async () => {
    const { service, createClanker } = build({ ecsReady: true });

    const agent = await service.prepareDefaultAgent({ provider: "anthropic" });

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

    await service.prepareDefaultAgent({ provider: "moonshotai" });

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
    await first.service.prepareDefaultAgent({ provider: "anthropic" });
    const created = runner(first.createClanker.mock.calls[0][0], "active");

    const { service, updateClanker, start } = build({ existing: created });
    const agent = await service.prepareDefaultAgent({ provider: "anthropic" });

    expect(updateClanker).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(agent.status).toBe("active");
  });

  it("reconfigures and restarts it for another provider", async () => {
    const first = build();
    await first.service.prepareDefaultAgent({ provider: "anthropic" });
    const existing = runner(first.createClanker.mock.calls[0][0], "active");

    const { service, updateClanker, start } = build({ existing });
    await service.prepareDefaultAgent({ provider: "opencode-go" });

    expect(updateClanker).toHaveBeenCalledWith(
      "clanker-1",
      expect.objectContaining({ agent: "opencode", status: "inactive", statusMessage: null }),
    );
    expect(start).toHaveBeenCalled();
  });

  it("retries a default agent that failed to start", async () => {
    const first = build();
    await first.service.prepareDefaultAgent({ provider: "anthropic" });
    const failed = runner(first.createClanker.mock.calls[0][0], "failed");

    const { service, start } = build({ existing: failed });
    await service.prepareDefaultAgent({ provider: "anthropic" });

    expect(start).toHaveBeenCalled();
  });

  it("needs the model key first", async () => {
    const { service, createClanker } = build({ secret: false });

    await expect(service.prepareDefaultAgent({ provider: "anthropic" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING,
      message: "Connect your Anthropic key first, so the agent has something to run with.",
    });
    expect(createClanker).not.toHaveBeenCalled();
  });

  it("runs the default agent on a model endpoint with a harness that speaks its API, binding no vendor key", async () => {
    const { service, createClanker, getLatestSecretForProvider } = build({ endpoint: ZAI });

    const agent = await service.prepareDefaultAgent({ endpointId: ZAI.id, model: "glm-4.7-flash" });

    expect(agent.agent).toBe("opencode");
    expect(getLatestSecretForProvider).not.toHaveBeenCalled();
    expect(createClanker).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "opencode",
        secretBindings: [],
        modelEndpoint: { endpointId: ZAI.id, model: "glm-4.7-flash" },
        description: "Runs OpenCode on z.ai (glm-4.7-flash). Created by setup.",
      }),
    );
  });

  it("picks Pi for an endpoint OpenCode can't speak", async () => {
    const { service } = build({ endpoint: { ...ZAI, apiFormat: "anthropic-messages" } });
    await expect(service.prepareDefaultAgent({ endpointId: ZAI.id, model: "glm-4.7-flash" })).resolves.toMatchObject({ agent: "pi" });
  });

  it("says so when the endpoint is gone", async () => {
    const { service } = build({ endpoint: null });
    await expect(service.prepareDefaultAgent({ endpointId: ZAI.id, model: "glm-4.7-flash" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING,
    });
  });
});

 it("selects Kubernetes ahead of AWS when a worker namespace is configured", async () => {
   const previous = process.env.KUBERNETES_WORKER_NAMESPACE;
   process.env.KUBERNETES_WORKER_NAMESPACE = "workers";
   try {
     const { service, createClanker } = build({ ecsReady: true });
     expect((await service.prepareDefaultAgent({ provider: "anthropic" })).compute).toBe("kubernetes");
     expect(createClanker).toHaveBeenCalledWith(expect.objectContaining({ deploymentStrategyId: "kubernetes-id" }));
   } finally {
     if (previous === undefined) delete process.env.KUBERNETES_WORKER_NAMESPACE;
     else process.env.KUBERNETES_WORKER_NAMESPACE = previous;
   }
 });
