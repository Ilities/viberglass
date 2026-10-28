import { createLogger as createWinstonLogger, transports } from "winston";
import { DeepSeekHarnessAgent } from "../src";
import { DeepSeekHarnessModelEndpointEnvironment } from "../src/DeepSeekHarnessModelEndpointEnvironment";
import type { DeepSeekHarnessConfig } from "../src";
import { MODEL_ENDPOINT_KEY_ENV_VAR, type WorkerModelEndpoint } from "@viberglass/types";
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
  private readonly missingBinaries: Set<string>;
  private readonly exitCode: number;

  constructor(config: DeepSeekHarnessConfig, missingBinaries: string[] = [], exitCode = 0) {
    const logger = createWinstonLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    super(config, logger);
    this.missingBinaries = new Set(missingBinaries);
    this.exitCode = exitCode;
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

function createLogger() {
  return createWinstonLogger({ silent: true, transports: [] });
}

function createEndpoint(overrides: Partial<WorkerModelEndpoint> = {}): WorkerModelEndpoint {
  return {
    name: "workspace-model",
    baseUrl: "https://llm.example.com/v1",
    apiFormat: "openai-chat",
    auth: { scheme: "bearer" },
    extraHeaders: {},
    model: "some-model",
    mayColdStart: false,
    ...overrides,
  };
}

describe("DeepSeekHarnessAgent", () => {
  describe("CLI invocation", () => {
    it("invokes dsh headless with the prompt, in the repo", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig());

      await agent.run("- Fix the bug", createExecutionContext(), "/tmp/dsh-test");

      expect(agent.capturedCommands).toHaveLength(1);
      const cmd = agent.capturedCommands[0];
      expect(cmd.command).toBe("dsh");
      expect(cmd.args).toEqual(["--profile", "headless", "- Fix the bug"]);
      expect(cmd.options.cwd).toBe("/tmp/dsh-test/repo");
    });

    it("injects DEEPSEEK_API_KEY and the non-interactive permission mode", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig({ apiKey: "sk-test" }));

      await agent.run("Do task", createExecutionContext(), "/tmp/dsh-test");

      const env = agent.capturedCommands[0]?.options.env;
      expect(env?.DEEPSEEK_API_KEY).toBe("sk-test");
      expect(env?.DSH_PERMISSION_MODE).toBe("workspace-write");
    });

    it("throws a clear error when dsh is not installed", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig(), ["dsh"]);

      await expect(agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test")).rejects.toThrow(
        "The 'dsh' CLI was not found",
      );
    });

    it("throws when the CLI exits non-zero", async () => {
      const agent = new TestDeepSeekHarnessAgent(createConfig(), [], 2);

      await expect(agent.run("Fix bug", createExecutionContext(), "/tmp/dsh-test")).rejects.toThrow(
        /DeepSeek Harness execution failed \(Exit 2\)/,
      );
    });
  });

  describe("getAcpServerCommand", () => {
    it("returns dsh-acp as the ACP bridge command", () => {
      const agent = new DeepSeekHarnessAgent(createConfig(), createLogger());
      expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
    });
  });

  describe("getAcpEnvironment", () => {
    it("returns DEEPSEEK_API_KEY and the non-interactive permission mode", () => {
      const agent = new DeepSeekHarnessAgent(createConfig({ apiKey: "sk-test" }), createLogger());
      expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
        DEEPSEEK_API_KEY: "sk-test",
        DSH_PERMISSION_MODE: "workspace-write",
      });
    });

    it("leaves the key out when none is configured", () => {
      const agent = new DeepSeekHarnessAgent(createConfig({ apiKey: "" }), createLogger());
      expect(agent.getAcpEnvironment("/nonexistent")).toEqual({
        DSH_PERMISSION_MODE: "workspace-write",
      });
    });
  });

  describe("custom endpoint environment", () => {
    const previousKey = process.env[MODEL_ENDPOINT_KEY_ENV_VAR];

    afterEach(() => {
      if (previousKey === undefined) delete process.env[MODEL_ENDPOINT_KEY_ENV_VAR];
      else process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = previousKey;
    });

    it("points the harness at the endpoint with its model and bearer key", () => {
      process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = "endpoint-key";
      const environment = new DeepSeekHarnessModelEndpointEnvironment(createEndpoint());

      expect(environment.resolve()).toEqual({
        DEEPSEEK_BASE_URL: "https://llm.example.com/v1",
        DSH_MODEL: "some-model",
        DEEPSEEK_API_KEY: "endpoint-key",
      });
    });

    it("leaves the key out for an endpoint that authenticates another way", () => {
      process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = "endpoint-key";
      const environment = new DeepSeekHarnessModelEndpointEnvironment(
        createEndpoint({ auth: { scheme: "header", header: "X-Api-Key" } }),
      );

      expect(environment.resolve()).toEqual({
        DEEPSEEK_BASE_URL: "https://llm.example.com/v1",
        DSH_MODEL: "some-model",
      });
    });
  });
});
