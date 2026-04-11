import { createLogger, transports } from "winston";
import type { GeminiConfig } from "../src";
import { GeminiCLIAgent } from "../src";
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

class TestGeminiCLIAgent extends GeminiCLIAgent {
  public capturedCommands: CapturedCommand[] = [];
  private readonly missingBinaries: Set<string>;

  constructor(config: GeminiConfig, missingBinaries: string[] = []) {
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

  protected override async cleanup(_workDir: string): Promise<void> {
    return;
  }
}

function createGeminiConfig(
  overrides: Partial<GeminiConfig> = {},
): GeminiConfig {
  return {
    name: "gemini-cli",
    apiKey: "gemini-test-key",
    model: "gemini-2.5-pro",
    approvalMode: "auto_edit",
    capabilities: ["typescript"],
    costPerExecution: 0.35,
    averageSuccessRate: 0.77,
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

describe("GeminiCLIAgent CLI invocation", () => {
  test("uses supported Gemini CLI headless flags", async () => {
    const agent = new TestGeminiCLIAgent(createGeminiConfig());

    const result = await agent.run(
      "Implement the fix",
      createExecutionContext(true),
      "/tmp/gemini-agent-test",
    );

    expect(result.success).toBe(true);
    expect(agent.capturedCommands).toHaveLength(1);

    const first = agent.capturedCommands[0];
    expect(first.command).toBe("gemini");
    expect(first.options.cwd).toBe("/tmp/gemini-agent-test/repo");
    expect(first.args).toEqual(
      expect.arrayContaining([
        "--output-format",
        "json",
        "--approval-mode",
        "auto_edit",
        "--model",
        "gemini-2.5-pro",
      ]),
    );
    expect(first.options.env?.GEMINI_API_KEY).toBe("gemini-test-key");
    expect(first.options.env?.GOOGLE_API_KEY).toBe("gemini-test-key");

    const prompt = first.args.at(-1);
    expect(prompt).toContain("Implement the fix");
    expect(prompt).toContain("Limit changes to 5 files.");
    expect(prompt).toContain(
      "Before finishing, run relevant tests and fix any failures.",
    );
  });

  test("throws a clear error when gemini is not installed", async () => {
    const agent = new TestGeminiCLIAgent(createGeminiConfig(), ["gemini"]);

    await expect(
      agent.run(
        "Implement the fix",
        createExecutionContext(false),
        "/tmp/gemini-agent-test",
      ),
    ).rejects.toThrow("The 'gemini' CLI was not found");

    expect(agent.capturedCommands).toHaveLength(1);
    expect(agent.capturedCommands[0].command).toBe("gemini");
  });
});
