import { describe, expect, it } from "@jest/globals";
import deepseekHarnessPlugin from "../src/plugin";
import { DeepseekHarnessAgent, type DeepseekHarnessConfig } from "../src";
import { createLogger } from "winston";

const logger = createLogger({ silent: true });
const config: DeepseekHarnessConfig = {
  name: "deepseek-harness",
  apiKey: "test-key",
  model: "deepseek-v4-pro",
  capabilities: ["typescript"],
  costPerExecution: 0,
  averageSuccessRate: 1,
  executionTimeLimit: 60,
  resourceLimits: { maxMemoryMB: 512, maxCpuPercent: 80, maxDiskSpaceMB: 512, maxNetworkRequests: 10 },
};

describe("DeepseekHarnessAgent", () => {
  it("creates an agent instance from the plugin and declares the default DeepSeek binding", () => {
    expect(deepseekHarnessPlugin.create(config, logger)).toBeInstanceOf(DeepseekHarnessAgent);
    expect(deepseekHarnessPlugin.id).toBe("deepseek-harness");
    expect(deepseekHarnessPlugin.label).toBe("DeepSeek Harness");
    expect(deepseekHarnessPlugin.docker.variant).toBe("deepseek-harness");
    expect(deepseekHarnessPlugin.docker.supportedAgents).toContain("deepseek-harness");
    expect(deepseekHarnessPlugin.providers).toEqual([
      { provider: "deepseek", envVar: "DEEPSEEK_API_KEY", default: true, model: "deepseek-v4-pro" },
    ]);
  });

  it("sets ACP command and required DeepSeek environment", () => {
    const agent = new DeepseekHarnessAgent(config, logger);
    expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
    expect(agent.getAcpEnvironment("/tmp/harness-config")).toEqual({
      DSH_PERMISSION_MODE: "workspace-write",
      DEEPSEEK_API_KEY: "test-key",
      DSH_MODEL: "deepseek-v4-pro",
      DSH_HOME: "/tmp/harness-config/deepseek-harness",
      DSH_SESSION_ROOT: "/tmp/harness-config/deepseek-harness/sessions",
    });
  });

  it("builds the headless one-shot argument vector", () => {
    const agent = new DeepseekHarnessAgent(config, logger);
    expect(agent.headlessArguments("make a change")).toEqual(["--profile", "headless", "make a change"]);
  });

  it("isolates one-shot state in the job workspace", () => {
    const env = new DeepseekHarnessAgent(config, logger).getRunEnvironment("/tmp/job");
    expect(env.DSH_HOME).toBe("/tmp/job/.dsh");
    expect(env.DSH_SESSION_ROOT).toBe("/tmp/job/.dsh-acp/sessions");
  });
});
