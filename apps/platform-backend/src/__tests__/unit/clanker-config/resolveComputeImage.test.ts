import type { Clanker } from "@viberglass/types";
import { resolveComputeImage } from "../../../clanker-config/resolveComputeImage";

function clanker(strategy: Record<string, unknown>): Clanker {
  return {
    id: "a0b7f08b-cf96-4d8e-9b2b-fd451e390ec2",
    name: "OpenCode Local",
    slug: "opencode-local",
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig: { version: 1, strategy, agent: { type: "opencode" } },
    configFiles: [],
    agent: "opencode",
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    statusMessage: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("resolveComputeImage", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, VIBERATOR_WORKER_IMAGE_TAG: "v1.2.2" };
    delete process.env.VIBERATOR_WORKER_REGISTRY;
    delete process.env.VIBERATOR_WORKER_IMAGE_PREFIX;
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it("gives a Docker runner on the published image the installation's tag", () => {
    expect(resolveComputeImage(clanker({ type: "docker", provisioningMode: "prebuilt" }))).toBe(
      "viberator-worker-opencode:v1.2.2",
    );
  });

  it("keeps a Docker runner's custom image", () => {
    expect(resolveComputeImage(clanker({ type: "docker", provisioningMode: "prebuilt", containerImage: "registry.example/worker:1" }))).toBe(
      "registry.example/worker:1",
    );
  });

  it("reads the image a Docker runner built from source", () => {
    expect(resolveComputeImage(clanker({ type: "docker", provisioningMode: "managed", containerImage: "viberator-worker-opencode:latest" }))).toBe(
      "viberator-worker-opencode:latest",
    );
    expect(resolveComputeImage(clanker({ type: "docker", provisioningMode: "managed" }))).toBeNull();
  });

  it("gives a Kubernetes runner on the published image the installation's tag", () => {
    expect(resolveComputeImage(clanker({ type: "kubernetes" }))).toBe("viberator-worker-opencode:v1.2.2");
  });

  it("keeps a Kubernetes runner's custom image", () => {
    expect(resolveComputeImage(clanker({ type: "kubernetes", containerImage: "registry.example/worker:1" }))).toBe("registry.example/worker:1");
  });

  it("reads the image of an ECS runner's task definition", () => {
    const taskDefinitionDetails = {
      containerImages: [
        { name: "sidecar", image: "sidecar:1" },
        { name: "worker", image: "ghcr.io/ilities/viberator-worker-opencode:v1.2.1" },
      ],
    };
    expect(resolveComputeImage(clanker({ type: "ecs", containerName: "worker", taskDefinitionDetails }))).toBe(
      "ghcr.io/ilities/viberator-worker-opencode:v1.2.1",
    );
    expect(resolveComputeImage(clanker({ type: "ecs", containerImage: "123.dkr.ecr/worker:1" }))).toBe("123.dkr.ecr/worker:1");
  });

  it("reads the image a Lambda runner's function runs", () => {
    expect(resolveComputeImage(clanker({ type: "lambda", functionDetails: { imageUri: "123.dkr.ecr/lambda:2" }, imageUri: "123.dkr.ecr/lambda:1" }))).toBe(
      "123.dkr.ecr/lambda:2",
    );
    expect(resolveComputeImage(clanker({ type: "lambda", imageUri: "123.dkr.ecr/lambda:1" }))).toBe("123.dkr.ecr/lambda:1");
  });

  it("is null when the runner names no image", () => {
    expect(resolveComputeImage(clanker({ type: "lambda", functionName: "worker" }))).toBeNull();
  });
});
