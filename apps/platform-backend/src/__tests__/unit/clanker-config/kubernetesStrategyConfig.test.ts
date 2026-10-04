import type { Clanker } from "@viberglass/types";
import { resolveClankerConfig } from "../../../clanker-config";

function clanker(deploymentConfig: Record<string, unknown>): Clanker {
  return {
    id: "a0b7f08b-cf96-4d8e-9b2b-fd451e390ec2",
    name: "Kubernetes Worker",
    slug: "kubernetes-worker",
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: {
      id: "49d05298-a93e-4d0b-a968-2090bc3a28ac",
      name: "kubernetes",
      description: null,
      configSchema: null,
      createdAt: "2026-09-30T00:00:00.000Z",
    },
    deploymentConfig,
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

describe("Kubernetes Clanker config", () => {
  it("retains a V1 Kubernetes strategy and its resource settings", () => {
    const result = resolveClankerConfig(clanker({
      version: 1,
      strategy: {
        type: "kubernetes",
        containerImage: "registry.example/worker:1",
        namespace: "viberglass-workers",
        cpu: "500m",
        memory: "1Gi",
        ephemeralStorage: "2Gi",
        activeDeadlineSeconds: 3600,
      },
      agent: { type: "opencode" },
    }));

    expect(result.source).toBe("v1");
    expect(result.config.strategy).toEqual({
      type: "kubernetes",
      provisioningMode: "prebuilt",
      containerImage: "registry.example/worker:1",
      namespace: "viberglass-workers",
      cpu: "500m",
      memory: "1Gi",
      ephemeralStorage: "2Gi",
      activeDeadlineSeconds: 3600,
    });
  });

  it("maps a legacy Kubernetes strategy and discards an invalid deadline", () => {
    const result = resolveClankerConfig(clanker({
      containerImage: "registry.example/worker:2",
      activeDeadlineSeconds: -1,
    }));

    expect(result.source).toBe("legacy");
    expect(result.config.strategy).toMatchObject({
      type: "kubernetes",
      containerImage: "registry.example/worker:2",
    });
    expect(result.config.strategy).toHaveProperty("activeDeadlineSeconds", undefined);
  });
});
