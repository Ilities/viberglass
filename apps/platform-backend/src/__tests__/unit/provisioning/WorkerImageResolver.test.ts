import { getWorkerImageForClanker } from "../../../provisioning/shared/workerImage";
import type { ProvisioningStrategyName } from "../../../provisioning/types";
import { buildClanker } from "./testUtils";

describe("getWorkerImageForClanker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VIBERATOR_WORKER_REGISTRY;
    delete process.env.VIBERATOR_WORKER_IMAGE_PREFIX;
    delete process.env.VIBERATOR_LAMBDA_IMAGE_URI;
    delete process.env.VIBERATOR_WORKER_IMAGE_TAG;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults ECS Pi workers to the public agent image", () => {
    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: { type: "ecs" },
      agent: { type: "pi" },
    });
    clanker.agent = "pi";
    expect(getWorkerImageForClanker(clanker, "ecs")).toBe(
      "ghcr.io/ilities/viberator-worker-pi:latest",
    );
  });

  it("preserves an explicitly configured ECS image", () => {
    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: { type: "ecs", containerImage: "custom.example/worker:1" },
      agent: { type: "claude-code" },
    });
    expect(getWorkerImageForClanker(clanker, "ecs")).toBe("custom.example/worker:1");
  });

  it("uses explicit lambda imageUri when provided", () => {
    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        imageUri: "explicit-lambda-image:latest",
      },
      agent: { type: "codex" },
    });

    const image = getWorkerImageForClanker(clanker, "lambda");

    expect(image).toBe("explicit-lambda-image:latest");
  });

  it("can ignore explicit lambda imageUri when requested", () => {
    process.env.VIBERATOR_LAMBDA_IMAGE_URI =
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com/viberator-lambda-worker:latest";

    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        imageUri: "explicit-lambda-image:latest",
      },
      agent: { type: "codex" },
    });

    const image = getWorkerImageForClanker(clanker, "lambda", {
      ignoreStrategyImage: true,
    });

    expect(image).toBe(process.env.VIBERATOR_LAMBDA_IMAGE_URI);
  });

  it("uses VIBERATOR_LAMBDA_IMAGE_URI as default for lambda", () => {
    process.env.VIBERATOR_LAMBDA_IMAGE_URI =
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com/viberator-lambda-worker:latest";
    process.env.VIBERATOR_WORKER_REGISTRY =
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com";
    process.env.VIBERATOR_WORKER_IMAGE_PREFIX = "viberator";

    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
      },
      agent: { type: "codex" },
    });
    clanker.agent = "codex";

    const image = getWorkerImageForClanker(clanker, "lambda");

    expect(image).toBe(process.env.VIBERATOR_LAMBDA_IMAGE_URI);
  });

  it("falls back to lambda catalog image when lambda env default is missing", () => {
    process.env.VIBERATOR_WORKER_REGISTRY =
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com";
    process.env.VIBERATOR_WORKER_IMAGE_PREFIX = "viberator";

    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
      },
    });
    clanker.agent = "codex";

    const image = getWorkerImageForClanker(clanker, "lambda");

    expect(image).toBe(
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com/viberator/viberator-lambda-worker:latest",
    );
  });

  it("uses agent-specific catalog image for ecs", () => {
    process.env.VIBERATOR_WORKER_REGISTRY =
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com";
    process.env.VIBERATOR_WORKER_IMAGE_PREFIX = "viberator";

    const clanker = buildClanker("ecs", {
      version: 1,
      strategy: {
        type: "ecs",
      },
    });
    clanker.agent = "codex";

    const image = getWorkerImageForClanker(clanker, "ecs");

    expect(image).toBe(
      "111111111111.dkr.ecr.eu-west-1.amazonaws.com/viberator/viberator-worker-codex:latest",
    );
  });

  const taggedStrategies: ProvisioningStrategyName[] = ["ecs", "docker", "kubernetes"];

  it.each(taggedStrategies)(
    "tags %s worker images with VIBERATOR_WORKER_IMAGE_TAG",
    (strategy) => {
      process.env.VIBERATOR_WORKER_REGISTRY = "registry.example";
      process.env.VIBERATOR_WORKER_IMAGE_TAG = "abc123";
      const clanker = buildClanker(strategy, {
        version: 1,
        strategy: { type: strategy },
      });
      clanker.agent = "codex";

      expect(getWorkerImageForClanker(clanker, strategy)).toBe(
        "registry.example/viberator-worker-codex:abc123",
      );
    },
  );

  it("keeps the lambda catalog image on latest", () => {
    process.env.VIBERATOR_WORKER_REGISTRY = "registry.example";
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "abc123";
    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: { type: "lambda" },
    });

    expect(getWorkerImageForClanker(clanker, "lambda")).toBe(
      "registry.example/viberator-lambda-worker:latest",
    );
  });
});
