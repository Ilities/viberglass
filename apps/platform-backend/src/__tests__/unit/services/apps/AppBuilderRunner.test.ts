import type { Clanker, UpdateClankerRequest } from "@viberglass/types";
import { AppBuilderRunner, AppBuilderUnavailable } from "../../../../services/apps/AppBuilderRunner";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const DOCKER_CONFIG = {
  version: 1,
  strategy: { type: "docker", provisioningMode: "prebuilt", containerImage: "viberglass-app-builder-node:latest" },
  agent: { type: "claude-code" },
};

function runner(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "builder-1",
    name: "App builder",
    slug: "viberglass-app-builder",
    deploymentConfig: DOCKER_CONFIG,
    configFiles: [],
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function build(options: { existingId?: string | null; stored?: Clanker[]; strategy?: "docker" | "ecs" | "kubernetes" } = {}) {
  const stored = [...(options.stored ?? [runner()])];
  const deps = {
    platformRunners: {
      findId: jest.fn(async () => (options.existingId === undefined ? "builder-1" : options.existingId)),
      create: jest.fn(async () => "builder-1"),
    },
    runners: {
      getClanker: jest.fn(async () => stored.shift() ?? null),
      updateClanker: jest.fn(async (id: string, updates: UpdateClankerRequest) =>
        runner({ id, deploymentConfig: updates.deploymentConfig, status: updates.status ?? "inactive" })),
    },
    strategies: { getDeploymentStrategyByName: jest.fn(async (name: string) => ({ id: `strategy-${name}`, name, createdAt: "" })) },
    starter: { start: jest.fn(async (clanker: Clanker) => ({ clanker, provisioning: Promise.resolve() })) },
  };
  const builder = new AppBuilderRunner(deps.platformRunners, deps.runners, deps.strategies, deps.starter, () => options.strategy ?? "docker");
  return { builder, deps };
}

describe("AppBuilderRunner", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
    delete process.env.APP_BUILDER_IMAGE;
    delete process.env.VIBERATOR_WORKER_REGISTRY;
    delete process.env.VIBERATOR_WORKER_IMAGE_PREFIX;
    delete process.env.VIBERATOR_WORKER_IMAGE_TAG;
  });
  afterAll(() => {
    process.env = env;
  });

  it("uses the running builder as it is", async () => {
    const { builder, deps } = build();

    await expect(builder.ready()).resolves.toMatchObject({ id: "builder-1" });
    expect(deps.platformRunners.create).not.toHaveBeenCalled();
    expect(deps.starter.start).not.toHaveBeenCalled();
  });

  it("creates the builder where this installation's workers run, then starts it", async () => {
    const ecsConfig = { ...DOCKER_CONFIG, strategy: { type: "ecs", provisioningMode: "managed", containerImage: "ghcr.io/ilities/viberglass-app-builder-node:latest" } };
    const { builder, deps } = build({ existingId: null, strategy: "ecs", stored: [runner({ status: "inactive", deploymentConfig: ecsConfig }), runner({ deploymentConfig: ecsConfig })] });

    await builder.ready();

    expect(deps.platformRunners.create).toHaveBeenCalledWith("app_builder", {
      name: "App builder",
      slug: "viberglass-app-builder",
      deploymentStrategyId: "strategy-ecs",
      deploymentConfig: {
        version: 1,
        strategy: { type: "ecs", provisioningMode: "managed", containerImage: "ghcr.io/ilities/viberglass-app-builder-node:latest" },
        agent: { type: expect.any(String) },
      },
    });
    expect(deps.starter.start).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
  });

  it("uses the image as it is on Docker", async () => {
    process.env.APP_BUILDER_IMAGE = "viberglass-app-builder-node:latest";
    const { builder, deps } = build({ existingId: null, stored: [runner()] });

    await builder.ready();

    expect(deps.platformRunners.create).toHaveBeenCalledWith("app_builder", expect.objectContaining({
      deploymentConfig: expect.objectContaining({
        strategy: { type: "docker", provisioningMode: "prebuilt", containerImage: "viberglass-app-builder-node:latest" },
      }),
    }));
  });

  it("starts the builder again on the image the installation now names", async () => {
    process.env.APP_BUILDER_IMAGE = "registry.example/app-builder:2";
    const { builder, deps } = build({ stored: [runner(), runner()] });

    await builder.ready();

    expect(deps.runners.updateClanker).toHaveBeenCalledWith("builder-1", {
      deploymentStrategyId: "strategy-docker",
      deploymentConfig: expect.objectContaining({ strategy: { type: "docker", provisioningMode: "prebuilt", containerImage: "registry.example/app-builder:2" } }),
      status: "inactive",
      statusMessage: null,
    });
    expect(deps.starter.start).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
  });

  it("waits while the builder is starting", async () => {
    const { builder } = build({ stored: [runner({ status: "deploying" })] });

    await expect(builder.ready()).rejects.toBeInstanceOf(AppBuilderUnavailable);
  });

  it("says why the builder couldn't start", async () => {
    const { builder } = build({ stored: [runner({ status: "failed" }), runner({ status: "failed", statusMessage: "Docker image not found" })] });

    await expect(builder.ready()).rejects.toThrow("The app builder couldn't start: Docker image not found");
  });
});
