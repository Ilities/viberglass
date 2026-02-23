import { createLogger, transports } from "winston";
import { MistralVibeAgent } from "./MistralVibeAgent";
import type { ExecutionContext, MistralVibeConfig } from "../types";
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

class TestMistralVibeAgent extends MistralVibeAgent {
  public capturedCommands: CapturedCommand[] = [];
  private readonly failPrimaryBinaryWithEnoent: boolean;
  private didFailPrimaryBinary = false;

  constructor(config: MistralVibeConfig, failPrimaryBinaryWithEnoent = false) {
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    super(config, logger);
    this.failPrimaryBinaryWithEnoent = failPrimaryBinaryWithEnoent;
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

    if (
      command === "vibe" &&
      this.failPrimaryBinaryWithEnoent &&
      !this.didFailPrimaryBinary
    ) {
      this.didFailPrimaryBinary = true;
      const enoentError = new Error("spawn vibe ENOENT");
      Object.defineProperty(enoentError, "code", { value: "ENOENT" });
      throw enoentError;
    }

    return {
      stdout: '{"commit":"abc123","pr_url":"https://example.test/pr/1"}',
      stderr: "",
      exitCode: 0,
    };
  }

  protected override async getChangedFiles(
    _repoDir: string,
  ): Promise<string[]> {
    return ["src/example.ts"];
  }

  protected override async cleanup(_workDir: string): Promise<void> {
    return;
  }
}

function createMistralConfig(
  overrides: Partial<MistralVibeConfig> = {},
): MistralVibeConfig {
  return {
    name: "mistral-vibe",
    apiKey: "mistral-test-key",
    capabilities: ["typescript"],
    costPerExecution: 0.4,
    averageSuccessRate: 0.8,
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

describe("MistralVibeAgent CLI invocation", () => {
  test("uses documented vibe programmatic mode arguments", async () => {
    const agent = new TestMistralVibeAgent(createMistralConfig());

    const result = await agent.run(
      "Implement the fix",
      createExecutionContext(true),
      "/tmp/mistral-agent-test",
    );

    expect(result.success).toBe(true);

    expect(agent.capturedCommands).toHaveLength(1);
    const first = agent.capturedCommands[0];
    expect(first.command).toBe("vibe");
    expect(first.args).toEqual(
      expect.arrayContaining([
        "--prompt",
        "--output",
        "json",
        "--workdir",
        "/tmp/mistral-agent-test/repo",
      ]),
    );
    expect(first.options.cwd).toBe("/tmp/mistral-agent-test");
    expect(first.options.env?.MISTRAL_API_KEY).toBe("mistral-test-key");

    const promptIndex = first.args.indexOf("--prompt");
    expect(promptIndex).toBeGreaterThanOrEqual(0);
    const effectivePrompt = first.args[promptIndex + 1];
    expect(effectivePrompt).toContain("Implement the fix");
    expect(effectivePrompt).toContain("Limit changes to 5 files.");
    expect(effectivePrompt).toContain(
      "Before finishing, run relevant tests and fix any failures.",
    );
  });

  test("falls back to mistral-vibe binary when vibe is unavailable", async () => {
    const agent = new TestMistralVibeAgent(createMistralConfig(), true);

    await agent.run(
      "Implement the fix",
      createExecutionContext(false),
      "/tmp/mistral-agent-test",
    );

    expect(agent.capturedCommands).toHaveLength(2);
    expect(agent.capturedCommands[0].command).toBe("vibe");
    expect(agent.capturedCommands[1].command).toBe("mistral-vibe");
    expect(agent.capturedCommands[1].options.env?.MISTRAL_API_KEY).toBe(
      "mistral-test-key",
    );
  });
});
