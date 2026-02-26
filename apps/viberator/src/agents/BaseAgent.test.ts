import { createLogger, transports } from "winston";
import { BaseAgent } from "./BaseAgent";
import type { AgentConfig, ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as fs from "fs";

class TestBaseAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    return false;
  }

  protected async executeAgentCLI(
    _prompt: string,
    _context: ExecutionContext,
    _workDir: string,
  ): Promise<AgentCLIResult> {
    return {
      success: true,
      changedFiles: [],
    };
  }

  public buildEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return this.buildCommandEnvironment(env);
  }
}

function createConfig(): AgentConfig {
  return {
    name: "codex",
    apiKey: "",
    capabilities: ["typescript"],
    costPerExecution: 0.1,
    averageSuccessRate: 0.9,
    executionTimeLimit: 30,
    resourceLimits: {
      maxMemoryMB: 512,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 100,
    },
  };
}

describe("BaseAgent executeCommand environment", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  test("preserves HOME when it points to an existing directory", async () => {
    process.env.HOME = "/tmp";
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    const agent = new TestBaseAgent(createConfig(), logger);

    const env = agent.buildEnv();
    expect(env.HOME).toBe("/tmp");
  });

  test("falls back HOME to /tmp when HOME points to a missing directory", async () => {
    const missingHome = `/tmp/base-agent-missing-home-${Date.now()}/does-not-exist`;
    process.env.HOME = missingHome;
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    const agent = new TestBaseAgent(createConfig(), logger);

    const env = agent.buildEnv();
    expect(env.HOME).not.toBe(missingHome);
    expect(typeof env.HOME).toBe("string");
    expect(fs.existsSync(env.HOME || "")).toBe(true);
  });
});
