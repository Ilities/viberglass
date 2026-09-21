import { createLogger, transports } from "winston";
import { BaseAgent } from "@viberglass/agent-core";
import type { BaseAgentConfig, ExecutionContext, AgentCLIResult } from "@viberglass/agent-core";
import * as fs from "fs";

class TestBaseAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    return false;
  }

  public getAcpServerCommand(): string[] {
    return ["test-cli", "--acp"];
  }

  protected async executeAgentCLI(
    _prompt: string,
    _context: ExecutionContext,
    _workDir: string,
  ): Promise<AgentCLIResult> {
    return {
      success: true,
      changedFiles: [],
    };
  }

  public buildEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return this.buildCommandEnvironment(env);
  }
}

function createConfig(): BaseAgentConfig {
  return {
    name: "codex",
    apiKey: "",
    capabilities: ["typescript"],
    costPerExecution: 0.1,
    averageSuccessRate: 0.9,
    executionTimeLimit: 30,
    resourceLimits: {
      maxMemoryMB: 512,
      maxCpuPercent: 80,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 100,
    },
  };
}

describe("BaseAgent executeCommand environment", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  test("preserves HOME when it points to an existing directory", async () => {
    process.env.HOME = "/tmp";
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    const agent = new TestBaseAgent(createConfig(), logger);

    const env = agent.buildEnv();
    expect(env.HOME).toBe("/tmp");
  });

  test("falls back HOME to /tmp when HOME points to a missing directory", async () => {
    const missingHome = `/tmp/base-agent-missing-home-${Date.now()}/does-not-exist`;
    process.env.HOME = missingHome;
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    const agent = new TestBaseAgent(createConfig(), logger);

    const env = agent.buildEnv();
    expect(env.HOME).not.toBe(missingHome);
    expect(typeof env.HOME).toBe("string");
    expect(fs.existsSync(env.HOME || "")).toBe(true);
  });
});

describe("BaseAgent credential boundary", () => {
  const touched: string[] = [];

  function setEnv(name: string, value: string): void {
    touched.push(name);
    process.env[name] = value;
  }

  function buildAgentEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const logger = createLogger({
      silent: true,
      transports: [new transports.Console({ silent: true })],
    });
    return new TestBaseAgent(createConfig(), logger).buildEnv(overrides);
  }

  afterEach(() => {
    for (const name of touched.splice(0)) {
      delete process.env[name];
    }
  });

  test("withholds the SCM token from the spawned CLI", () => {
    setEnv("GITHUB_TOKEN", "ghp_should_never_reach_the_agent");
    setEnv("GH_TOKEN", "ghp_should_never_reach_the_agent");
    setEnv("GITLAB_TOKEN", "glpat_should_never_reach_the_agent");

    const env = buildAgentEnv();

    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.GITLAB_TOKEN).toBeUndefined();
  });

  test("withholds AWS and platform credentials", () => {
    setEnv("AWS_SECRET_ACCESS_KEY", "aws-secret");
    setEnv("AWS_SESSION_TOKEN", "aws-session");
    setEnv("DATABASE_URL", "postgres://user:pw@host/db");
    setEnv("WEBHOOK_SECRET_ENCRYPTION_KEY", "webhook-key");

    const env = buildAgentEnv();

    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AWS_SESSION_TOKEN).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.WEBHOOK_SECRET_ENCRYPTION_KEY).toBeUndefined();
  });

  test("drops unrecognised variables rather than passing them through", () => {
    setEnv("SOME_INTERNAL_THING", "value");

    expect(buildAgentEnv().SOME_INTERNAL_THING).toBeUndefined();
  });

  test("keeps the provider key and PATH the CLI needs", () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");

    const env = buildAgentEnv();

    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.PATH).toBe(process.env.PATH);
  });

  test("filters overrides too, so a plugin spreading process.env cannot leak", () => {
    const env = buildAgentEnv({
      ...process.env,
      GITHUB_TOKEN: "ghp_via_override",
      ANTHROPIC_API_KEY: "sk-ant-override",
    });

    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-override");
  });

  test("passes through operator-declared clanker variables", () => {
    setEnv("VIBERGLASS_AGENT_ENV_PASSTHROUGH", "MY_BUILD_FLAG,GITHUB_TOKEN");
    setEnv("MY_BUILD_FLAG", "on");
    setEnv("GITHUB_TOKEN", "ghp_via_passthrough");

    const env = buildAgentEnv();

    expect(env.MY_BUILD_FLAG).toBe("on");
    // Passthrough does not override the denylist.
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
