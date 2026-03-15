import { createLogger, transports } from "winston";
import { CodexAgent } from "./CodexAgent";
import type { AgentConfig, ExecutionContext } from "../types";
import type { CodexConfig } from "../types";
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

class TestCodexAgent extends CodexAgent {
  public capturedCommand?: CapturedCommand;

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
    this.capturedCommand = { command, args, options };
    return { stdout: "{}", stderr: "", exitCode: 0 };
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

function createCodexConfig(overrides: Partial<CodexConfig> = {}): AgentConfig {
  return {
    name: "codex",
    apiKey: "sk-test",
    model: "gpt-5-codex",
    endpoint: "https://api.openai.example/v1",
    capabilities: ["typescript"],
    costPerExecution: 0.25,
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

describe("CodexAgent CLI invocation", () => {
  const previousCodexAuthMode = process.env.CODEX_AUTH_MODE;

  afterEach(() => {
    if (previousCodexAuthMode === undefined) {
      delete process.env.CODEX_AUTH_MODE;
    } else {
      process.env.CODEX_AUTH_MODE = previousCodexAuthMode;
    }
  });

  test("uses codex exec positional prompt and test instruction for device auth mode", async () => {
    process.env.CODEX_AUTH_MODE = "chatgpt_device";
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });

    const agent = new TestCodexAgent(createCodexConfig(), logger);
    await agent.run(
      "Implement the fix",
      createExecutionContext(true),
      "/tmp/codex-agent-test",
    );

    expect(agent.capturedCommand).toBeDefined();
    if (!agent.capturedCommand) {
      throw new Error("Expected command to be captured");
    }

    expect(agent.capturedCommand.command).toBe("codex");
    expect(agent.capturedCommand.args[0]).toBe("--yolo");
    expect(agent.capturedCommand.args).toContain("exec");
    expect(agent.capturedCommand.args).not.toContain("--prompt");
    expect(agent.capturedCommand.args).toEqual(
      expect.arrayContaining([
        "--json",
        "--skip-git-repo-check",
        "--cd",
        "/tmp/codex-agent-test/repo",
        "--model",
        "gpt-5-codex",
      ]),
    );
    expect(agent.capturedCommand.args.at(-2)).toBe("--");
    expect(agent.capturedCommand.args.at(-1)).toContain(
      "Before finishing, run relevant tests and fix any failures.",
    );
    expect(agent.capturedCommand.options.env?.OPENAI_API_KEY).toBeUndefined();
    expect(agent.capturedCommand.options.env?.OPENAI_BASE_URL).toBe(
      "https://api.openai.example/v1",
    );
  });

  test("does not inject OPENAI_API_KEY for stored device auth mode", async () => {
    process.env.CODEX_AUTH_MODE = "chatgpt_device_stored";
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });

    const agent = new TestCodexAgent(createCodexConfig(), logger);
    await agent.run(
      "Implement the fix",
      createExecutionContext(false),
      "/tmp/codex-agent-test",
    );

    expect(agent.capturedCommand).toBeDefined();
    if (!agent.capturedCommand) {
      throw new Error("Expected command to be captured");
    }

    expect(agent.capturedCommand.options.env?.OPENAI_API_KEY).toBeUndefined();
  });

  test("injects OPENAI_API_KEY only for api_key auth mode", async () => {
    process.env.CODEX_AUTH_MODE = "api_key";
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });

    const agent = new TestCodexAgent(
      createCodexConfig({ apiKey: "sk-runtime" }),
      logger,
    );
    await agent.run(
      "Implement the fix",
      createExecutionContext(false),
      "/tmp/codex-agent-test",
    );

    expect(agent.capturedCommand).toBeDefined();
    if (!agent.capturedCommand) {
      throw new Error("Expected command to be captured");
    }

    expect(agent.capturedCommand.options.env?.OPENAI_API_KEY).toBe(
      "sk-runtime",
    );
    expect(agent.capturedCommand.args.at(-1)).toBe("Implement the fix");
  });
});
