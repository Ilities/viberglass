import { isObjectRecord } from "@viberglass/types";
import type { DockerClientPort } from "../../../provisioning/ports/DockerClientPort";
import { DockerProvisioningHandler } from "../../../provisioning/strategies/DockerProvisioningHandler";
import { buildClanker } from "./testUtils";

describe("DockerProvisioningHandler", () => {
  function buildDockerClient(): {
    client: DockerClientPort;
    buildImage: jest.Mock;
    pullImage: jest.Mock;
    inspectImage: jest.Mock;
  } {
    const buildImage = jest.fn(async () => undefined);
    const pullImage = jest.fn(async () => undefined);
    const inspectImage = jest.fn(async () => ({ Id: "sha256:123" }));

    const client: DockerClientPort = {
      buildImage,
      pullImage,
      inspectImage,
    };

    return { client, buildImage, pullImage, inspectImage };
  }

  function prebuiltClanker(containerImage?: string) {
    return buildClanker("docker", {
      version: 1,
      strategy: {
        type: "docker",
        provisioningMode: "prebuilt",
        containerImage,
        dockerBuild: { logs: ["old build output"] },
      },
      agent: { type: "opencode" },
    });
  }

  function provisionedStrategy(deploymentConfig: unknown): Record<string, unknown> {
    if (!isObjectRecord(deploymentConfig) || !isObjectRecord(deploymentConfig.strategy)) {
      throw new Error("provisioning returned no strategy");
    }
    return deploymentConfig.strategy;
  }

  const missingImage = { statusCode: 404, message: "No such image" };

  it("returns null preflight error", () => {
    const { client } = buildDockerClient();
    const handler = new DockerProvisioningHandler(client, {
      repoRoot: "/tmp",
    });

    expect(handler.getPreflightError(buildClanker("docker", null))).toBeNull();
  });

  it("provisions docker and returns active availability", async () => {
    const { client, buildImage, inspectImage } = buildDockerClient();
    inspectImage.mockResolvedValue({
      Id: "sha256:abc",
      Created: "2026-02-20T00:00:00.000Z",
      Size: 123,
      VirtualSize: 456,
      Architecture: "amd64",
      Os: "linux",
      RepoTags: ["worker:latest"],
      RepoDigests: ["sha256:def"],
    });

    const handler = new DockerProvisioningHandler(client, {
      repoRoot: process.cwd(),
    });

    const clanker = buildClanker("docker", {
      version: 1,
      strategy: {
        type: "docker",
        provisioningMode: "managed",
      },
      agent: { type: "claude-code" },
    });

    const progress = jest.fn();
    const result = await handler.provision(clanker, progress);

    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(inspectImage).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("active");

    expect(isObjectRecord(result.deploymentConfig)).toBe(true);
    if (!isObjectRecord(result.deploymentConfig)) {
      return;
    }

    const strategy = result.deploymentConfig.strategy;
    expect(isObjectRecord(strategy)).toBe(true);
    if (!isObjectRecord(strategy)) {
      return;
    }

    expect(strategy.type).toBe("docker");
    expect(strategy.containerImage).toBeDefined();
    expect(progress).toHaveBeenCalled();
  });

  it("returns inactive when docker image is not configured", async () => {
    const { client } = buildDockerClient();
    const handler = new DockerProvisioningHandler(client, {
      repoRoot: "/tmp",
    });

    const result = await handler.checkAvailability(buildClanker("docker", null));

    expect(result).toEqual({
      status: "inactive",
      statusMessage: "Docker image not configured",
    });
  });

  it("returns inactive when image is missing", async () => {
    const { client, inspectImage } = buildDockerClient();
    inspectImage.mockRejectedValue({ statusCode: 404, message: "No such image" });

    const handler = new DockerProvisioningHandler(client, {
      repoRoot: "/tmp",
    });

    const clanker = buildClanker("docker", {
      version: 1,
      strategy: {
        type: "docker",
        containerImage: "missing-image",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);
    expect(result).toEqual({
      status: "inactive",
      statusMessage: "Docker image not found",
    });
  });

  it("returns failed when docker check throws unexpected error", async () => {
    const { client, inspectImage } = buildDockerClient();
    inspectImage.mockRejectedValue(new Error("docker socket unavailable"));

    const handler = new DockerProvisioningHandler(client, {
      repoRoot: "/tmp",
    });

    const clanker = buildClanker("docker", {
      version: 1,
      strategy: {
        type: "docker",
        containerImage: "worker:latest",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);

    expect(result.status).toBe("failed");
    expect(result.statusMessage).toContain("docker socket unavailable");
  });

  describe("pre-built mode", () => {
    it("uses a local image without building or pulling", async () => {
      const { client, buildImage, pullImage } = buildDockerClient();
      const handler = new DockerProvisioningHandler(client, { repoRoot: "/tmp" });

      const result = await handler.provision(prebuiltClanker("worker:prebuilt"));

      expect(buildImage).not.toHaveBeenCalled();
      expect(pullImage).not.toHaveBeenCalled();
      expect(result.status).toBe("active");
      const strategy = provisionedStrategy(result.deploymentConfig);
      expect(strategy.containerImage).toBe("worker:prebuilt");
      expect(strategy.provisioningMode).toBe("prebuilt");
      expect(strategy.dockerBuild).toBeUndefined();
    });

    it("pulls a missing image and reports finished layers", async () => {
      const { client, buildImage, pullImage, inspectImage } = buildDockerClient();
      inspectImage.mockRejectedValueOnce(missingImage);
      pullImage.mockImplementation(async ({ onEvent }) => {
        onEvent?.({ status: "Pulling from org/worker", id: "1" });
        onEvent?.({ status: "Pulling fs layer", id: "a" });
        onEvent?.({ status: "Pulling fs layer", id: "b" });
        onEvent?.({ status: "Downloading", id: "a" });
        onEvent?.({ status: "Pull complete", id: "a" });
        onEvent?.({ status: "Already exists", id: "b" });
      });
      const handler = new DockerProvisioningHandler(client, { repoRoot: "/tmp" });
      const progress = jest.fn();

      const result = await handler.provision(prebuiltClanker("org/worker:1"), progress);

      expect(buildImage).not.toHaveBeenCalled();
      expect(pullImage).toHaveBeenCalledWith(
        expect.objectContaining({ image: "org/worker:1" }),
      );
      expect(progress.mock.calls.map(([message]) => message)).toEqual([
        "Pulling Docker image org/worker:1",
        "Pulling Docker image org/worker:1: 1 of 2 layers",
        "Pulling Docker image org/worker:1: 2 of 2 layers",
      ]);
      expect(result.status).toBe("active");
    });

    it("explains a failed pull", async () => {
      const { client, pullImage, inspectImage } = buildDockerClient();
      inspectImage.mockRejectedValue(missingImage);
      pullImage.mockRejectedValue(new Error("pull access denied for org/worker"));
      const handler = new DockerProvisioningHandler(client, { repoRoot: "/tmp" });

      await expect(handler.provision(prebuiltClanker("org/worker:1"))).rejects.toThrow(
        "Docker image org/worker:1 isn't available locally and couldn't be pulled: pull access denied for org/worker",
      );
    });

    it("does not pull when Docker itself is unreachable", async () => {
      const { client, pullImage, inspectImage } = buildDockerClient();
      inspectImage.mockRejectedValue(new Error("connect ENOENT /var/run/docker.sock"));
      const handler = new DockerProvisioningHandler(client, { repoRoot: "/tmp" });

      await expect(handler.provision(prebuiltClanker("org/worker:1"))).rejects.toThrow(
        "docker.sock",
      );
      expect(pullImage).not.toHaveBeenCalled();
    });

    it("falls back to the catalog image for the agent", async () => {
      const { client, inspectImage } = buildDockerClient();
      const handler = new DockerProvisioningHandler(client, { repoRoot: "/tmp" });

      const result = await handler.provision(prebuiltClanker());

      const strategy = provisionedStrategy(result.deploymentConfig);
      expect(strategy.containerImage).toMatch(/opencode|multi-agent/);
      expect(inspectImage).toHaveBeenCalledWith(strategy.containerImage);
    });
  });
});
