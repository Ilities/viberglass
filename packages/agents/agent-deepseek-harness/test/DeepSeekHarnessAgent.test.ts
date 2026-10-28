import { createLogger, transports } from "winston";
import { DeepSeekHarnessAgent, DeepSeekHarnessModelEndpointEnvironment } from "../src";
import type { DeepSeekHarnessConfig } from "../src";
import type { AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";
import { MODEL_ENDPOINT_KEY_ENV_VAR, type WorkerModelEndpoint } from "@viberglass/types";

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

  constructor(config: DeepSeekHarnessConfig, options: { missingBinaries?: string[]; exitCode?: number } = {}) {
    super(config, createLogger({ silent: true, transports: [new transports.Console({ silent: true })] }));
    this.missingBinaries = new Set(options.missingBinaries ?? []);
    this.exitCode = options.exitCode ?? 0;
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
      const error = new Error(`spawn ${command} ENOENT`);
      Object.defineProperty(error, "code", { value: "ENOENT" });
      throw error;
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
    apiKey: "sk-deepseek-test",
    capabilities: ["typescript"],
    costPerExecution: 0.1,
    averageSuccessRate: 0.9,
    executionTimeLimit: 60,
    resourceLimits: { maxMemoryMB: 512, maxCpuPercent: 80, maxDiskSpaceMB: 512, maxNetworkRequests: 100 },
    ...overrides,
  };
}

function context(): ExecutionContext {
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

const endpoint: WorkerModelEndpoint = {
  name: "Workspace models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  extraHeaders: {},
  model: "mock-model",
  mayColdStart: false,
};

const savedEndpoint = process.env.MODEL_ENDPOINT_CONFIG;
const savedKey = process.env[MODEL_ENDPOINT_KEY_ENV_VAR];

afterEach(() => {
  if (savedEndpoint === undefined) delete process.env.MODEL_ENDPOINT_CONFIG;
  else process.env.MODEL_ENDPOINT_CONFIG = savedEndpoint;
  if (savedKey === undefined) delete process.env[MODEL_ENDPOINT_KEY_ENV_VAR];
  else process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = savedKey;
});

describe("DeepSeekHarnessAgent", () => {
  it("starts its ACP server through dsh-acp", () => {
    const agent = new TestDeepSeekHarnessAgent(createConfig());
    expect(agent.getAcpServerCommand()).toEqual(["dsh-acp"]);
  });

  it("passes the runner's key, model and permission mode to the ACP server", () => {
    const agent = new TestDeepSeekHarnessAgent(
      createConfig({ apiKey: "sk-deepseek-test", model: "deepseek-v4-pro", endpoint: "https://api.deepseek.com" }),
    );
    expect(agent.getAcpEnvironment("/tmp/harness-config")).toEqual({
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DSH_PERMISSION_MODE: "workspace-write",
      DSH_MODEL: "deepseek-v4-pro",
    });
  });

  it("uses the workspace model endpoint's key, URL and model", () => {
    process.env.MODEL_ENDPOINT_CONFIG = JSON.stringify(endpoint);
    process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = "endpoint-key";
    const agent = new TestDeepSeekHarnessAgent(createConfig({ apiKey: "" }));

    expect(agent.getAcpEnvironment("/tmp/harness-config")).toEqual({
      DEEPSEEK_API_KEY: "endpoint-key",
      DEEPSEEK_BASE_URL: endpoint.baseUrl,
      DSH_PERMISSION_MODE: "workspace-write",
      DSH_MODEL: endpoint.model,
    });
  });

  it("runs dsh in headless mode inside the repo with the same environment", async () => {
    const agent = new TestDeepSeekHarnessAgent(createConfig({ model: "deepseek-v4-pro" }));

    await agent.run("Fix the bug", context(), "/tmp/deepseek-workdir");

    expect(agent.capturedCommands).toHaveLength(1);
    const command = agent.capturedCommands[0]!;
    expect(command.command).toBe("dsh");
    expect(command.args).toEqual(["--profile", "headless", "Fix the bug"]);
    expect(command.options.cwd).toBe("/tmp/deepseek-workdir/repo");
    expect(command.options.env).toMatchObject({
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DSH_PERMISSION_MODE: "workspace-write",
      DSH_MODEL: "deepseek-v4-pro",
    });
  });

  it("reports a missing dsh binary", async () => {
    const agent = new TestDeepSeekHarnessAgent(createConfig(), { missingBinaries: ["dsh"] });
    await expect(agent.run("Fix", context(), "/tmp/deepseek-workdir")).rejects.toThrow(
      "The 'dsh' CLI was not found",
    );
  });

  it("reports a non-zero exit with the harness's output", async () => {
    const agent = new TestDeepSeekHarnessAgent(createConfig(), { exitCode: 2 });
    await expect(agent.run("Fix", context(), "/tmp/deepseek-workdir")).rejects.toThrow(
      "DeepSeek Harness failed (Exit 2)",
    );
  });
});

describe("DeepSeekHarnessModelEndpointEnvironment", () => {
  it("points dsh at the endpoint and records the endpoint for the agent", () => {
    delete process.env[MODEL_ENDPOINT_KEY_ENV_VAR];
    const env = new DeepSeekHarnessModelEndpointEnvironment(endpoint).resolve();
    expect(env.DEEPSEEK_BASE_URL).toBe(endpoint.baseUrl);
    expect(env.DSH_MODEL).toBe(endpoint.model);
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(JSON.parse(env.MODEL_ENDPOINT_CONFIG!)).toMatchObject({ baseUrl: endpoint.baseUrl, model: endpoint.model });
  });

  it("carries the endpoint key when it is already in the environment", () => {
    process.env[MODEL_ENDPOINT_KEY_ENV_VAR] = "endpoint-key";
    const env = new DeepSeekHarnessModelEndpointEnvironment(endpoint).resolve();
    expect(env.DEEPSEEK_API_KEY).toBe("endpoint-key");
  });
});
