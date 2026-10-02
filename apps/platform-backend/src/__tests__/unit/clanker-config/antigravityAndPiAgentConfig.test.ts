import type { AgentType, Clanker } from "@viberglass/types";
import { resolveClankerConfig } from "../../../clanker-config";

function clanker(agent: AgentType, deploymentConfig: Record<string, unknown>): Clanker {
  return {
    id: "5c0f2a31-7f0e-4b51-9d3e-1f6a2b7c8d90",
    name: agent,
    slug: agent,
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig,
    configFiles: [],
    agent,
    secretBindings: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

describe("Antigravity agent config", () => {
  it("keeps the model a runner sets", () => {
    const { config } = resolveClankerConfig(
      clanker("antigravity", {
        version: 1,
        strategy: { type: "docker" },
        agent: { type: "antigravity", model: "gemini-3.1-pro-high" },
      }),
    );

    expect(config.agent).toEqual({ type: "antigravity", model: "gemini-3.1-pro-high" });
  });

  it("keeps it for a legacy config too", () => {
    const { config } = resolveClankerConfig(clanker("antigravity", { model: "gemini-3.1-pro-high" }));

    expect(config.agent).toEqual({ type: "antigravity", model: "gemini-3.1-pro-high" });
  });
});

describe("Pi agent config", () => {
  it("stays pi rather than falling back to claude-code", () => {
    const { config } = resolveClankerConfig(
      clanker("pi", { version: 1, strategy: { type: "docker" }, agent: { type: "pi" } }),
    );

    expect(config.agent).toEqual({ type: "pi" });
  });

  it("stays pi for a legacy config too", () => {
    const { config } = resolveClankerConfig(clanker("pi", {}));

    expect(config.agent).toEqual({ type: "pi" });
  });
});
