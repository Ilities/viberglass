import { isObjectRecord } from "@viberglass/types";
import type { DockerClientPort } from "../../../provisioning/ports/DockerClientPort";
import { DockerProvisioningHandler } from "../../../provisioning/strategies/DockerProvisioningHandler";
import { buildClanker } from "./testUtils";

describe("DockerProvisioningHandler", () => {
  function buildDockerClient(): {
    client: DockerClientPort;
    buildImage: jest.Mock;
    inspectImage: jest.Mock;
  } {
    const buildImage = jest.fn(async () => undefined);
    const inspectImage = jest.fn(async () => ({ Id: "sha256:123" }));

    const client: DockerClientPort = {
      buildImage,
      inspectImage,
    };

    return { client, buildImage, inspectImage };
  }

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
});
