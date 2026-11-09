import { describe, expect, it } from "@jest/globals";
import { createLogger, transports } from "winston";
import deepseekHarnessPlugin from "../src/plugin";
import { DeepseekHarnessAgent, type DeepseekHarnessConfig } from "../src";
import { DeepseekModelEndpointEnvironment } from "../src/DeepseekModelEndpointEnvironment";
import type { AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";
import type { WorkerModelEndpoint } from "@viberglass/types";

interface CapturedCommand {
  command: string;
  args: string[];
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv };
}

class TestDeepseekHarnessAgent extends DeepseekHarnessAgent {
  public capturedCommands: CapturedCommand[] = [];
  constructor(
    config: DeepseekHarnessConfig,
    private readonly exitCode = 0,
    private readonly missing = false,
  ) {
    super(config, createLogger({ silent: true, transports: [new transports.Console({ silent: true })] }));
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
    if (this.missing) {
      const error = new Error(`spawn ${command} ENOENT`);
      Object.defineProperty(error, "code", { value: "ENOENT" });
      throw error;
    }
    return { stdout: "", stderr: "boom", exitCode: this.exitCode };
  }

  protected override async cleanup(): Promise<void> {
    return;
  }
}

const logger = createLogger({ silent: true });

function createConfig(overrides: Partial<DeepseekHarnessConfig> = {}): DeepseekHarnessConfig {
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

describe("DeepseekHarnessAgent", () => {
  it("creates an agent from the plugin with the plugin metadata", () => {
    expect(deepseekHarnessPlugin.create(createConfig(), logger)).toBeInstanceOf(DeepseekHarnessAgent);
    expect(deepseekHarnessPlugin.id).toBe("deepseek-harness");
    expect(deepseekHarnessPlugin.label).toBe("DeepSeek Harness");
    expect(deepseekHarnessPlugin.docker.supportedAgents).toEqual(["deepseek-harness"]);
  });

  it("starts the dsh ACP adapter", () => {
    expect(new TestDeepseekHarnessAgent(createConfig()).getAcpServerCommand()).toEqual(["dsh-acp"]);
  });

  it("passes the runner's key and an explicit permission mode to the ACP adapter", () => {
    const env = new TestDeepseekHarnessAgent(createConfig()).getAcpEnvironment("/unused");
    expect(env.DEEPSEEK_API_KEY).toBe("test-deepseek-key");
    expect(env.DSH_PERMISSION_MODE).toBe("workspace-write");
  });

  it("runs one headless job in the repo with the same environment", async () => {
    const agent = new TestDeepseekHarnessAgent(createConfig());
    const result = await agent.run("fix the bug", createExecutionContext(), "/tmp/work-x");

    expect(result.success).toBe(true);
    const [call] = agent.capturedCommands;
    expect(call.command).toBe("dsh");
    expect(call.args).toEqual(["--profile", "headless", "fix the bug"]);
    expect(call.options.cwd).toBe("/tmp/work-x/repo");
    expect(call.options.env?.DEEPSEEK_API_KEY).toBe("test-deepseek-key");
    expect(call.options.env?.DSH_PERMISSION_MODE).toBe("workspace-write");
  });

  it("reports a missing dsh CLI with the install command", async () => {
    const agent = new TestDeepseekHarnessAgent(createConfig(), 0, true);
    await expect(agent.run("task", createExecutionContext(), "/tmp/work-y")).rejects.toThrow("npm install -g @deepseek-ai/dsh");
  });

  it("fails the job on a non-zero exit", async () => {
    const agent = new TestDeepseekHarnessAgent(createConfig(), 2);
    await expect(agent.run("task", createExecutionContext(), "/tmp/work-z")).rejects.toThrow("(Exit 2): boom");
  });
});

describe("DeepseekModelEndpointEnvironment", () => {
  it("points dsh at the endpoint's base URL and model", () => {
    const endpoint: WorkerModelEndpoint = {
      name: "viberglass",
      baseUrl: "https://gateway.example.com/v1",
      apiFormat: "openai-chat",
      model: "deepseek-flash",
      auth: { scheme: "bearer" },
      extraHeaders: {},
      mayColdStart: false,
    };
    expect(new DeepseekModelEndpointEnvironment(endpoint).resolve()).toEqual({
      DEEPSEEK_BASE_URL: "https://gateway.example.com/v1",
      DSH_MODEL: "deepseek-flash",
    });
  });
});
