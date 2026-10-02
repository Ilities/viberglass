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
    status: "active",
    statusMessage: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("resolveComputeImage", () => {
  it("reads the container image a Docker runner starts", () => {
    expect(resolveComputeImage(clanker({ type: "docker", containerImage: "viberator-worker-opencode:latest" }))).toBe(
      "viberator-worker-opencode:latest",
    );
  });

  it("reads the container image of an ECS runner", () => {
    expect(resolveComputeImage(clanker({ type: "ecs", containerImage: "123.dkr.ecr/worker:1" }))).toBe("123.dkr.ecr/worker:1");
  });

  it("reads the container image of a Kubernetes runner", () => {
    expect(resolveComputeImage(clanker({ type: "kubernetes", containerImage: "registry.example/worker:1" }))).toBe("registry.example/worker:1");
  });

  it("reads the image URI of a Lambda runner", () => {
    expect(resolveComputeImage(clanker({ type: "lambda", imageUri: "123.dkr.ecr/lambda:1" }))).toBe("123.dkr.ecr/lambda:1");
  });

  it("is null when the runner names no image", () => {
    expect(resolveComputeImage(clanker({ type: "lambda", functionName: "worker" }))).toBeNull();
  });
});
