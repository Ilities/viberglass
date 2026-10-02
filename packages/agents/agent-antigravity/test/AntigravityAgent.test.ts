import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import type { ExecutionContext, ExecutionResult } from "@viberglass/agent-core";
import type { AntigravityConfig } from "../src";
import { AntigravityAgent } from "../src";

const logger = createLogger({
  silent: true,
  transports: [new transports.Console({ silent: true })],
});

class FakeAcpExecutor {
  public calls: Array<{ prompt: string; context: ExecutionContext }> = [];

  async execute(
    _agent: unknown,
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    this.calls.push({ prompt, context });
    return { success: true, changedFiles: [], executionTime: 0, cost: 0 };
  }
}

class TestAntigravityAgent extends AntigravityAgent {
  public cleanedUp: string[] = [];

  public run(prompt: string, context: ExecutionContext, workDir: string) {
    return this.executeAgentCLI(prompt, context, workDir);
  }

  protected override async cloneRepository(): Promise<void> {
    return;
  }

  protected override async cleanup(workDir: string): Promise<void> {
    this.cleanedUp.push(workDir);
  }
}

function createConfig(overrides: Partial<AntigravityConfig> = {}): AntigravityConfig {
  return {
    name: "antigravity",
    apiKey: "gemini-test-key",
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

function createExecutionContext(): ExecutionContext {
  return {
    repoUrl: "https://github.com/example/repo",
    branch: "feature/test",
    commitHash: "",
    bugDescription: "Fix bug",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    maxChanges: 5,
    testRequired: false,
    runTests: false,
    maxExecutionTime: 1800,
  };
}

describe("AntigravityAgent", () => {
  const originalHome = process.env.HOME;
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-home-"));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const settingsFile = () => path.join(home, ".gemini", "antigravity-acp", "settings.json");

  test("launches Google's ACP server", () => {
    const agent = new AntigravityAgent(createConfig(), logger);
    expect(agent.getAcpServerCommand()).toEqual(["agy_acp_server.par", "--uid="]);
  });

  test("passes the API key and disables the workspace trust prompt", () => {
    const agent = new AntigravityAgent(createConfig(), logger);

    expect(agent.getAcpEnvironment("/unused")).toEqual({
      GEMINI_API_KEY: "gemini-test-key",
      AGY_ACP_DISABLE_WORKSPACE_TRUST: "1",
    });
  });

  test("selects the configured model", () => {
    const agent = new AntigravityAgent(createConfig({ model: " gemini-3.1-pro-high " }), logger);

    expect(agent.getAcpEnvironment("/unused").AGY_ACP_DEFAULT_MODEL).toBe("gemini-3.1-pro-high");
  });

  test("selects API key auth in settings.json, keeping other settings", () => {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ auth: { type: "oauth-personal" }, ui: { theme: "dark" } }));
    const agent = new AntigravityAgent(createConfig(), logger);

    agent.getAcpEnvironment("/unused");

    expect(JSON.parse(fs.readFileSync(settingsFile(), "utf8"))).toEqual({
      auth: { type: "gemini-api-key" },
      ui: { theme: "dark" },
    });
  });

  test("replaces an unreadable settings.json", () => {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), "{not json");
    const agent = new AntigravityAgent(createConfig(), logger);

    agent.getAcpEnvironment("/unused");

    expect(JSON.parse(fs.readFileSync(settingsFile(), "utf8"))).toEqual({
      auth: { type: "gemini-api-key" },
    });
  });

  test("runs one-shot work as a single ACP turn in the cloned repo", async () => {
    const executor = new FakeAcpExecutor();
    const agent = new TestAntigravityAgent(
      createConfig(),
      logger,
      undefined,
      executor,
    );

    const result = await agent.run("Implement the fix", createExecutionContext(), "/tmp/agy-work");

    expect(result.success).toBe(true);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].prompt).toBe("Implement the fix");
    expect(executor.calls[0].context.repoDir).toBe("/tmp/agy-work/repo");
    expect(agent.cleanedUp).toEqual(["/tmp/agy-work"]);
  });

  test("cleans up when the ACP turn fails", async () => {
    const executor = new FakeAcpExecutor();
    executor.execute = async () => {
      throw new Error("Authentication required");
    };
    const agent = new TestAntigravityAgent(
      createConfig(),
      logger,
      undefined,
      executor,
    );

    await expect(
      agent.run("Implement the fix", createExecutionContext(), "/tmp/agy-work"),
    ).rejects.toThrow("Authentication required");
    expect(agent.cleanedUp).toEqual(["/tmp/agy-work"]);
  });
});
