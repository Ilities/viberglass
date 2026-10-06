import { getWorkerImageForClanker } from "../../../provisioning/shared/workerImage";
import { buildClanker } from "./testUtils";

describe("getWorkerImageForClanker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VIBERATOR_WORKER_REGISTRY;
    delete process.env.VIBERATOR_WORKER_IMAGE_PREFIX;
    delete process.env.VIBERATOR_LAMBDA_IMAGE_URI;
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
});
