import { describe, expect, it } from "@jest/globals";
import deepseekHarnessPlugin from "../src/plugin";
import { DeepseekHarnessAgent, type DeepseekHarnessConfig } from "../src";
import { createLogger } from "winston";

const logger = createLogger({ silent: true });

const config: DeepseekHarnessConfig = {
  name: "deepseek-harness",
  apiKey: "test-key",
  capabilities: ["typescript"],
  costPerExecution: 0,
  averageSuccessRate: 1,
  executionTimeLimit: 60,
  resourceLimits: { maxMemoryMB: 512, maxCpuPercent: 80, maxDiskSpaceMB: 512, maxNetworkRequests: 10 },
};

describe("DeepseekHarnessAgent", () => {
  it("creates an agent instance from the plugin", () => {
    expect(deepseekHarnessPlugin.create(config, logger)).toBeInstanceOf(DeepseekHarnessAgent);
  });

  it("plugin has required metadata", () => {
    expect(deepseekHarnessPlugin.id).toBe("deepseek-harness");
    expect(deepseekHarnessPlugin.label).toBeTruthy();
    expect(deepseekHarnessPlugin.docker.variant).toBe("deepseek-harness");
    expect(deepseekHarnessPlugin.docker.supportedAgents).toContain("deepseek-harness");
  });

  it("starts its ACP server with the runner's API key", () => {
    const agent = new DeepseekHarnessAgent(config, logger);
    expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
    expect(agent.getAcpEnvironment("/tmp/harness-config")).toEqual({
      DEEPSEEK_API_KEY: "test-key",
      DSH_PERMISSION_MODE: "workspace-write",
      DSH_MODEL: "deepseek-harness",
    });
  });
});
