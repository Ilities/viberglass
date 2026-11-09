import * as path from "path";
import { describe, expect, it } from "@jest/globals";
import { createLogger } from "winston";
import type { AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";
import deepSeekHarnessPlugin from "../src/plugin";
import { DeepSeekHarnessAgent, type DeepSeekHarnessConfig } from "../src";

interface CapturedCommand {
  command: string;
  args: string[];
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv };
}

class TestDeepSeekHarnessAgent extends DeepSeekHarnessAgent {
  public capturedCommands: CapturedCommand[] = [];
  public exitCode = 0;
  private readonly missingBinaries: Set<string>;

  constructor(config: DeepSeekHarnessConfig, missingBinaries: string[] = []) {
    super(config, createLogger({ silent: true }));
    this.missingBinaries = new Set(missingBinaries);
  }

  public run(prompt: string, context: ExecutionContext, workDir: string): Promise<AgentCLIResult> {
    return this.executeAgentCLI(prompt, context, workDir);
  }

  protected override async cloneRepository(): Promise<void> {
    return;
  }

  protected override async executeCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.capturedCommands.push({ command, args, options });

    if (this.missingBinaries.has(command)) {
      const enoentError = new Error(`spawn ${command} ENOENT`);
      Object.defineProperty(enoentError, "code", { value: "ENOENT" });
      throw enoentError;
    }

    return { stdout: "", stderr: "", exitCode: this.exitCode };
  }

  protected override async cleanup(): Promise<void> {
    return;
  }
}

function createConfig(overrides: Partial<DeepSeekHarnessConfig> = {}): DeepSeekHarnessConfig {
  return {
    name: "deepseek-harness",
    apiKey: "test-deepseek-key",
    capabilities: ["typescript"],
    costPerExecution: 0,
    averageSuccessRate: 1,
    executionTimeLimit: 60,
    resourceLimits: { maxMemoryMB: 512, maxCpuPercent: 80, maxDiskSpaceMB: 512, maxNetworkRequests: 10 },
    ...overrides,
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    repoUrl: "https://github.com/example/repo",
    branch: "main",
    commitHash: "",
    bugDescription: "Fix the bug",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    maxChanges: 5,
    testRequired: false,
    runTests: false,
    maxExecutionTime: 1800,
  };
}

describe("DeepSeekHarnessAgent", () => {
  it("creates an agent instance from the plugin", () => {
    expect(deepSeekHarnessPlugin.create(createConfig(), createLogger({ silent: true }))).toBeInstanceOf(
      DeepSeekHarnessAgent,
    );
  });

  it("plugin has required metadata", () => {
    expect(deepSeekHarnessPlugin.id).toBe("deepseek-harness");
    expect(deepSeekHarnessPlugin.label).toBe("DeepSeek Harness");
    expect(deepSeekHarnessPlugin.docker.variant).toBe("deepseek-harness");
    expect(deepSeekHarnessPlugin.docker.supportedAgents).toContain("deepseek-harness");
  });

  describe("getAcpServerCommand", () => {
    it("starts the dsh-acp bridge", () => {
      const agent = new DeepSeekHarnessAgent(createConfig(), createLogger({ silent: true }));
      expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
    });
  });

  describe("getAcpEnvironment", () => {
    it("passes the runner's key and never prompts for permissions", () => {
      const agent = new DeepSeekHarnessAgent(createConfig(), createLogger({ silent: true }));
      expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
        DEEPSEEK_API_KEY: "test-deepseek-key",
        DSH_PERMISSION_MODE: "workspace-write",
      });
    });

    it("passes the configured model through DSH_MODEL", () => {
      const agent = new DeepSeekHarnessAgent(createConfig({ model: "deepseek-v4-pro" }), createLogger({ silent: true }));
      expect(agent.getAcpEnvironment("/nonexistent").DSH_MODEL).toBe("deepseek-v4-pro");
    });

    it("omits the key and model when neither is set", () => {
      const agent = new DeepSeekHarnessAgent(createConfig({ apiKey: "" }), createLogger({ silent: true }));
      expect(agent.getAcpEnvironment("/nonexistent")).toEqual({ DSH_PERMISSION_MODE: "workspace-write" });
    });

    it("points the harness at a workspace model endpoint", () => {
      process.env.MODEL_ENDPOINT_CONFIG = JSON.stringify({
        name: "mock",
        baseUrl: "https://mock.example/v1",
        apiFormat: "openai-chat",
        auth: { scheme: "bearer" },
        extraHeaders: {},
        model: "deepseek-v4-pro",
        mayColdStart: false,
      });
      process.env.MODEL_ENDPOINT_API_KEY = "endpoint-key";
      try {
        const agent = new DeepSeekHarnessAgent(createConfig({ apiKey: "" }), createLogger({ silent: true }));
        expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
          DEEPSEEK_BASE_URL: "https://mock.example/v1",
          DEEPSEEK_API_KEY: "endpoint-key",
          DSH_MODEL: "deepseek-v4-pro",
          DSH_PERMISSION_MODE: "workspace-write",
        });
      } finally {
        delete process.env.MODEL_ENDPOINT_CONFIG;
        delete process.env.MODEL_ENDPOINT_API_KEY;
      }
    });
  });

  describe("one-shot CLI invocation", () => {
    it("runs dsh headless with the prompt in the repo", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig());

      await agent.run("Fix the bug", createExecutionContext(), "/tmp/dsh-test");

      expect(agent.capturedCommands).toHaveLength(1);
      const cmd = agent.capturedCommands[0];
      expect(cmd.command).toBe("dsh");
      expect(cmd.args).toEqual(["headless", "Fix the bug"]);
      expect(cmd.options.cwd).toBe(path.join("/tmp/dsh-test", "repo"));
    });

    it("carries the key and permission mode into the one-shot env", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig({ model: "deepseek-flash" }));

      await agent.run("Do task", createExecutionContext(), "/tmp/dsh-test");

      const env = agent.capturedCommands[0]?.options.env;
      expect(env?.DEEPSEEK_API_KEY).toBe("test-deepseek-key");
      expect(env?.DSH_MODEL).toBe("deepseek-flash");
      expect(env?.DSH_PERMISSION_MODE).toBe("workspace-write");
    });

    it("throws a clear error when the dsh binary is not installed", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig(), ["dsh"]);

      await expect(agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test")).rejects.toThrow(
        "The 'dsh' CLI was not found",
      );
    });

    it("throws with the CLI output on a non-zero exit", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig());
      agent.exitCode = 1;

      await expect(agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test")).rejects.toThrow(
        "DeepSeek Harness failed (Exit 1)",
      );
    });
  });
});
