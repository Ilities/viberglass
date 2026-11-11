import { createLogger, transports } from "winston";
import { AcpTurnFailedError, type BaseAgentConfig } from "@viberglass/agent-core";
import { ConfigManager } from "../config/ConfigManager";
import type { ExecutionContext } from "../types";
import { AgentOrchestrator } from "./AgentOrchestrator";
import { AcpExecutor } from "./AcpExecutor";

jest.mock("../agents/registerPlugins", () => ({
  agentRegistry: () => ({ createAgent: () => ({}), getAcpEventMapper: () => undefined, getDefaultConfigs: () => ({}) }),
}));

const logger = createLogger({ silent: true, transports: [new transports.Console({ silent: true })] });

const config: BaseAgentConfig = {
  name: "codex",
  capabilities: [],
  costPerExecution: 0,
  averageSuccessRate: 1,
  executionTimeLimit: 60,
  resourceLimits: { maxMemoryMB: 0, maxCpuPercent: 0, maxDiskSpaceMB: 0, maxNetworkRequests: 0 },
};

const context: ExecutionContext = {
  repoUrl: "",
  branch: "main",
  repoDir: "/tmp/viberator-work/task-1/repo",
  commitHash: "",
  bugDescription: "",
  stepsToReproduce: "",
  expectedBehavior: "",
  actualBehavior: "",
  consoleErrors: [],
  affectedFiles: [],
  maxChanges: 0,
  testRequired: false,
  runTests: false,
  maxExecutionTime: 30,
  promptOverride: "Write the notes",
  agentSessionId: "session-1",
};

function orchestrator(failure: Error): AgentOrchestrator {
  const acp = new AcpExecutor(logger);
  jest.spyOn(acp, "execute").mockRejectedValue(failure);
  return new AgentOrchestrator([config], logger, new ConfigManager(logger), acp);
}

describe("AgentOrchestrator", () => {
  it("reports what a failed turn's model calls used", async () => {
    const usage = { inputTokens: 12, outputTokens: 495, cacheReadInputTokens: 32_936 };
    const failure = new AcpTurnFailedError("exceeded retry limit, last status: 429 Too Many Requests", usage, "gpt-6-luna");

    const result = await orchestrator(failure).executeAgent(config, context);

    expect(result).toMatchObject({ success: false, errorMessage: "exceeded retry limit, last status: 429 Too Many Requests", usage, model: "gpt-6-luna" });
  });

  it("gives a turn whose harness reported no cost none, not the plugin's constant", async () => {
    const acp = new AcpExecutor(logger);
    jest.spyOn(acp, "execute").mockResolvedValue({ success: true, changedFiles: [], executionTime: 0, usage: { inputTokens: 12, outputTokens: 5 } });
    const priced = { ...config, costPerExecution: 0.75 };

    const result = await new AgentOrchestrator([priced], logger, new ConfigManager(logger), acp).executeAgent(priced, context);

    expect(result.cost).toBeUndefined();
  });

  it("gives a failed turn no cost but what its harness reported", async () => {
    const acp = new AcpExecutor(logger);
    jest.spyOn(acp, "execute").mockRejectedValue(new AcpTurnFailedError("stopped", { inputTokens: 12 }));
    const priced = { ...config, costPerExecution: 0.75 };

    const result = await new AgentOrchestrator([priced], logger, new ConfigManager(logger), acp).executeAgent(priced, context);

    expect(result.cost).toBeUndefined();
  });

  it("reports no usage for a failure before any model call", async () => {
    const result = await orchestrator(new Error("Agent process failed to start: ENOENT")).executeAgent(config, context);

    expect(result.success).toBe(false);
    expect(result.usage).toBeUndefined();
  });
});
