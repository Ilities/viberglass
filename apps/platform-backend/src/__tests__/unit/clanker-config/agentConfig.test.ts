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
    mcpServerIds: [],
    skillIds: [],
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

  it("drops what the harness doesn't declare", () => {
    const { config } = resolveClankerConfig(
      clanker("antigravity", {
        version: 1,
        strategy: { type: "docker" },
        agent: { type: "antigravity", model: "  ", endpoint: "https://example.com", cli: { model: "x" } },
      }),
    );

    expect(config.agent).toEqual({ type: "antigravity" });
  });
});

describe("Pi agent config", () => {
  it("stays pi rather than falling back to claude-code", () => {
    const { config } = resolveClankerConfig(
      clanker("pi", { version: 1, strategy: { type: "docker" }, agent: { type: "pi" } }),
    );

    expect(config.agent).toEqual({ type: "pi" });
  });

  it("stays pi for a runner saved without a config", () => {
    const { config } = resolveClankerConfig(clanker("pi", {}));

    expect(config.agent).toEqual({ type: "pi" });
  });
});

describe("A harness left out of the build", () => {
  it("keeps its id, so the worker can say it isn't there", () => {
    const { config } = resolveClankerConfig(
      clanker("gone-agent", { version: 1, strategy: { type: "docker" }, agent: { type: "gone-agent", model: "m" } }),
    );

    expect(config.agent).toEqual({ type: "gone-agent" });
  });
});

describe("Sign-in", () => {
  it("keeps a sign-in method the harness declares, with its login", () => {
    const { config } = resolveClankerConfig(
      clanker("codex", {
        version: 1,
        strategy: { type: "docker" },
        agent: { type: "codex", signIn: { method: "chatgpt", loginSecretId: "login-1" } },
      }),
    );

    expect(config.agent).toEqual({ type: "codex", signIn: { method: "chatgpt", loginSecretId: "login-1" } });
  });

  it("drops one the harness doesn't declare", () => {
    const { config } = resolveClankerConfig(
      clanker("pi", { version: 1, strategy: { type: "docker" }, agent: { type: "pi", signIn: { method: "chatgpt" } } }),
    );

    expect(config.agent).toEqual({ type: "pi" });
  });
});
