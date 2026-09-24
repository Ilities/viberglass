import type { Clanker } from "@viberglass/types";
import { resolveClankerConfig } from "../../../clanker-config";

function kimiClanker(deploymentConfig: Record<string, unknown>): Clanker {
  return {
    id: "a0b7f08b-cf96-4d8e-9b2b-fd451e390ec2",
    name: "Kimi",
    slug: "kimi",
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig,
    configFiles: [],
    agent: "kimi-code",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  };
}

describe("Kimi agent config", () => {
  it("keeps the endpoint and model a runner sets", () => {
    const { config } = resolveClankerConfig(
      kimiClanker({
        version: 1,
        strategy: { type: "docker" },
        agent: { type: "kimi-code", endpoint: "https://api.moonshot.ai/v1", model: "kimi-k3" },
      }),
    );

    expect(config.agent).toEqual({
      type: "kimi-code",
      endpoint: "https://api.moonshot.ai/v1",
      model: "kimi-k3",
    });
  });

  it("keeps them for a legacy config too", () => {
    const { config } = resolveClankerConfig(kimiClanker({ endpoint: "https://api.moonshot.ai/v1" }));

    expect(config.agent).toEqual({ type: "kimi-code", endpoint: "https://api.moonshot.ai/v1" });
  });
});
