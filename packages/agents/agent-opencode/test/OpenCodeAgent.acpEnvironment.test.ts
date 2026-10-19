import { createLogger, transports } from "winston";
import { OpenCodeAgent } from "../src/OpenCodeAgent";
import type { OpenCodeConfig } from "../src/config";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });

function agent(config: Partial<OpenCodeConfig> = {}): OpenCodeAgent {
  return new OpenCodeAgent(
    {
      name: "opencode",
      apiKey: "",
      capabilities: [],
      costPerExecution: 0,
      averageSuccessRate: 0,
      executionTimeLimit: 60,
      resourceLimits: { maxMemoryMB: 1, maxCpuPercent: 1, maxDiskSpaceMB: 1, maxNetworkRequests: 1 },
      ...config,
    },
    logger,
  );
}

describe("OpenCodeAgent ACP environment", () => {
  const saved = { model: process.env.OPENCODE_MODEL, content: process.env.OPENCODE_CONFIG_CONTENT };

  afterEach(() => {
    if (saved.model === undefined) delete process.env.OPENCODE_MODEL;
    else process.env.OPENCODE_MODEL = saved.model;
    if (saved.content === undefined) delete process.env.OPENCODE_CONFIG_CONTENT;
    else process.env.OPENCODE_CONFIG_CONTENT = saved.content;
  });

  it("gives OpenCode the runner's model as its main and small model", () => {
    delete process.env.OPENCODE_CONFIG_CONTENT;
    process.env.OPENCODE_MODEL = "opencode-go/deepseek-v4.1-flash";

    const env = agent().getAcpEnvironment("/nonexistent");

    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}")).toEqual({
      model: "opencode-go/deepseek-v4.1-flash",
      small_model: "opencode-go/deepseek-v4.1-flash",
    });
  });

  it("names the runner's model for the run's record when OpenCode doesn't", () => {
    delete process.env.OPENCODE_CONFIG_CONTENT;
    process.env.OPENCODE_MODEL = "opencode-go/deepseek-v4.1-flash";

    expect(agent().configuredModel()).toBe("opencode-go/deepseek-v4.1-flash");
  });

  it("keeps a model endpoint's provider config and model", () => {
    process.env.OPENCODE_MODEL = "viberglass/qwen";
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ model: "viberglass/qwen", provider: { viberglass: {} } });

    const env = agent({ model: "opencode-go/kimi-k3" }).getAcpEnvironment("/nonexistent");

    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}")).toEqual({
      model: "viberglass/qwen",
      small_model: "viberglass/qwen",
      provider: { viberglass: {} },
    });
  });

  it("leaves OpenCode's config alone when the runner names no model", () => {
    delete process.env.OPENCODE_MODEL;
    delete process.env.OPENCODE_CONFIG_CONTENT;

    expect(agent().getAcpEnvironment("/nonexistent").OPENCODE_CONFIG_CONTENT).toBeUndefined();
  });
});
