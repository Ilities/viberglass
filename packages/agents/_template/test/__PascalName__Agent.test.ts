import { describe, expect, it } from "@jest/globals";
import __camelName__Plugin from "../src/plugin";
import { __PascalName__Agent, type __PascalName__Config } from "../src";
import { createLogger } from "winston";

const logger = createLogger({ silent: true });

const config: __PascalName__Config = {
  name: "__NAME__",
  apiKey: "test-key",
  capabilities: ["typescript"],
  costPerExecution: 0,
  averageSuccessRate: 1,
  executionTimeLimit: 60,
  resourceLimits: { maxMemoryMB: 512, maxCpuPercent: 80, maxDiskSpaceMB: 512, maxNetworkRequests: 10 },
};

describe("__PascalName__Agent", () => {
  it("creates an agent instance from the plugin", () => {
    expect(__camelName__Plugin.create(config, logger)).toBeInstanceOf(__PascalName__Agent);
  });

  it("plugin has required metadata", () => {
    expect(__camelName__Plugin.id).toBe("__NAME__");
    expect(__camelName__Plugin.label).toBeTruthy();
    expect(__camelName__Plugin.docker.variant).toBe("__NAME__");
    expect(__camelName__Plugin.docker.supportedAgents).toContain("__NAME__");
  });

  it("starts its ACP server with the runner's API key", () => {
    const agent = new __PascalName__Agent(config, logger);
    expect(agent.getAcpServerCommand().length).toBeGreaterThan(0);
    expect(agent.getAcpEnvironment("/tmp/harness-config")).toEqual({ __NAME_UPPER___API_KEY: "test-key" });
  });
});
