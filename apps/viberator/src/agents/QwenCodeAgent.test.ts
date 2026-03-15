import { createLogger, transports } from "winston";
import { QwenCodeAgent } from "./QwenCodeAgent";
import type { ExecutionContext, QwenCodeConfig } from "../types";
import type { AgentCLIResult } from "./BaseAgent";

interface CapturedCommand {
  command: string;
  args: string[];
  options: {
    cwd?: string;
    timeout?: number;
    env?: NodeJS.ProcessEnv;
  };
}

class TestQwenCodeAgent extends QwenCodeAgent {
  public capturedCommands: CapturedCommand[] = [];
  private readonly missingBinaries: Set<string>;

  constructor(config: QwenCodeConfig, missingBinaries: string[] = []) {
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    super(config, logger);
    this.missingBinaries = new Set(missingBinaries);
  }

  public run(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    return this.executeAgentCLI(prompt, context, workDir);
  }

  protected override async cloneRepository(
    _repoUrl: string,
    _branch: string,
    _workDir: string,
  ): Promise<void> {
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

    return {
      stdout: '{"commit":"abc123","pr_url":"https://example.test/pr/1"}',
      stderr: "",
      exitCode: 0,
    };
  }

  protected async getChangedFiles(
    _repoDir: string,
  ): Promise<string[]> {
    return ["src/example.ts"];
  }

  protected override async cleanup(_workDir: string): Promise<void> {
    return;
  }
}

function createQwenConfig(
  overrides: Partial<QwenCodeConfig> = {},
): QwenCodeConfig {
  return {
    name: "qwen-cli",
    apiKey: "qwen-test-key",
    capabilities: ["typescript"],
    costPerExecution: 0.3,
    averageSuccessRate: 0.78,
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

function createExecutionContext(testRequired: boolean): ExecutionContext {
  return {
    repoUrl: "https://github.com/example/repo",
    branch: "feature/test",
    commitHash: "",
    bugDescription: "Fix bug",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    maxChanges: 5,
    testRequired,
    runTests: testRequired,
    maxExecutionTime: 1800,
  };
}

describe("QwenCodeAgent CLI invocation", () => {
  test("uses the qwen binary with openai-compatible environment variables", async () => {
    const agent = new TestQwenCodeAgent(createQwenConfig());

    const result = await agent.run(
      "Implement the fix",
      createExecutionContext(true),
      "/tmp/qwen-agent-test",
    );

    expect(result.success).toBe(true);
    expect(agent.capturedCommands).toHaveLength(1);
    expect(agent.capturedCommands[0].command).toBe("qwen");
    expect(agent.capturedCommands[0].args).toContain("--auth-type");
    expect(agent.capturedCommands[0].args).toContain("openai");
    expect(agent.capturedCommands[0].options.cwd).toBe(
      "/tmp/qwen-agent-test/repo",
    );
    expect(agent.capturedCommands[0].options.env?.OPENAI_API_KEY).toBe(
      "qwen-test-key",
    );
  });

  test("throws a clear error when qwen is not installed", async () => {
    const agent = new TestQwenCodeAgent(createQwenConfig(), ["qwen"]);

    await expect(
      agent.run(
        "Implement the fix",
        createExecutionContext(false),
        "/tmp/qwen-agent-test",
      ),
    ).rejects.toThrow("The 'qwen' CLI was not found");

    expect(agent.capturedCommands).toHaveLength(1);
    expect(agent.capturedCommands[0].command).toBe("qwen");
  });
});
