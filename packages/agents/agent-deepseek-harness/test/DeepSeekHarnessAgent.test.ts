import { createLogger, transports } from "winston";
import { DeepSeekHarnessAgent } from "../src";
import type { DeepSeekHarnessConfig } from "../src";
import type { AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";

interface CapturedCommand {
  command: string;
  args: string[];
  options: {
    cwd?: string;
    timeout?: number;
    env?: NodeJS.ProcessEnv;
  };
}

class TestDeepSeekHarnessAgent extends DeepSeekHarnessAgent {
  public capturedCommands: CapturedCommand[] = [];
  private readonly commandResults: number[] = [];
  private readonly missingBinaries: Set<string>;

  constructor(config: DeepSeekHarnessConfig, missingBinaries: string[] = [], commandResults: number[] = []) {
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    super(config, logger);
    this.missingBinaries = new Set(missingBinaries);
    this.commandResults.push(...commandResults);
  }

  public run(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
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

    const exitCode = this.commandResults.shift() ?? 0;
    if (this.missingBinaries.has(command)) {
      const enoentError = new Error(`spawn ${command} ENOENT`);
      Object.defineProperty(enoentError, "code", { value: "ENOENT" });
      throw enoentError;
    }

    return { stdout: "", stderr: "diagnostic", exitCode };
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
    costPerExecution: 0.1,
    averageSuccessRate: 0.9,
    executionTimeLimit: 60,
    resourceLimits: {
      maxMemoryMB: 512,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 100,
    },
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
  describe("CLI invocation", () => {
    it("invokes dsh headless with the prompt, in the repo", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig());

      await agent.run("Fix the bug", createExecutionContext(), "/tmp/dsh-test");

      expect(agent.capturedCommands).toHaveLength(1);
      const cmd = agent.capturedCommands[0];
      expect(cmd.command).toBe("dsh");
      expect(cmd.args).toEqual(["--profile", "headless", "Fix the bug"]);
      expect(cmd.options.cwd).toBe("/tmp/dsh-test/repo");
    });

    it("injects DEEPSEEK_API_KEY, the model and the permission mode", async () => {
      const agent = new TestDeepSeekHarnessAgent(
        createConfig({ apiKey: "sk-ds-test", model: "deepseek-v4.1-flash" }),
      );

      await agent.run("Do task", createExecutionContext(), "/tmp/dsh-test");

      const env = agent.capturedCommands[0]?.options.env;
      expect(env?.DEEPSEEK_API_KEY).toBe("sk-ds-test");
      expect(env?.DSH_MODEL).toBe("deepseek-v4.1-flash");
      expect(env?.DSH_PERMISSION_MODE).toBe("workspace-write");
    });

    it("throws a clear error when the dsh binary is not installed", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig(), ["dsh"]);

      await expect(
        agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test"),
      ).rejects.toThrow("The 'dsh' CLI was not found");
    });

    it("reports a non-zero exit as a failure with the CLI's stderr", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig(), [], [3]);

      await expect(
        agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test"),
      ).rejects.toThrow("Exit 3");
    });
  });

  describe("requiresApiKey", () => {
    it("needs a key, which validation checks when a run starts", () => {
      const logger = createLogger({ silent: true, transports: [] });
      expect(() => {
        new DeepSeekHarnessAgent(createConfig({ apiKey: "" }), logger);
      }).not.toThrow();
    });
  });

  describe("getAcpServerCommand", () => {
    it("returns dsh-acp as the ACP bridge command", () => {
      const logger = createLogger({ silent: true, transports: [] });
      const agent = new DeepSeekHarnessAgent(createConfig(), logger);
      expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
    });
  });

  describe("getAcpEnvironment", () => {
    it("returns DEEPSEEK_API_KEY, the model and the permission mode", () => {
      const logger = createLogger({ silent: true, transports: [] });
      const agent = new DeepSeekHarnessAgent(
        createConfig({ apiKey: "sk-ds-test", model: "deepseek-v4-pro" }),
        logger,
      );
      expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
        DEEPSEEK_API_KEY: "sk-ds-test",
        DSH_MODEL: "deepseek-v4-pro",
        DSH_PERMISSION_MODE: "workspace-write",
      });
    });

    it("falls back to the workspace model endpoint's key when the runner has none", () => {
      const logger = createLogger({ silent: true, transports: [] });
      const agent = new DeepSeekHarnessAgent(
        createConfig({ apiKey: "", model: undefined }),
        logger,
      );
      const previousKey = process.env.MODEL_ENDPOINT_API_KEY;
      process.env.MODEL_ENDPOINT_API_KEY = "endpoint-key";
      try {
        expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
          DEEPSEEK_API_KEY: "endpoint-key",
          DSH_PERMISSION_MODE: "workspace-write",
        });
      } finally {
        if (previousKey === undefined) delete process.env.MODEL_ENDPOINT_API_KEY;
        else process.env.MODEL_ENDPOINT_API_KEY = previousKey;
      }
    });

    it("leaves the model unset when only the endpoint names one", () => {
      const logger = createLogger({ silent: true, transports: [] });
      const agent = new DeepSeekHarnessAgent(createConfig({ model: undefined }), logger);
      const previousModel = process.env.DSH_MODEL;
      delete process.env.DSH_MODEL;
      try {
        expect(agent.getAcpEnvironment("/nonexistent").DSH_MODEL).toBeUndefined();
      } finally {
        if (previousModel !== undefined) process.env.DSH_MODEL = previousModel;
      }
    });
  });
});
