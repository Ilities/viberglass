import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import { ClaudeCodeAgent } from "../src/ClaudeCodeAgent";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });

describe("ClaudeCodeAgent ACP environment", () => {
  const saved = { home: process.env.HOME, configDir: process.env.CLAUDE_CONFIG_DIR };
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "claude-home-"));
    process.env.HOME = home;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    process.env.HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved.configDir;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("writes the run's settings into the worker's Claude Code settings, and lets it skip permission checks", () => {
    const agent = new ClaudeCodeAgent(
      {
        name: "claude-code",
        apiKey: "sk-ant-test",
        capabilities: [],
        costPerExecution: 0,
        averageSuccessRate: 0,
        executionTimeLimit: 60,
        resourceLimits: { maxMemoryMB: 1, maxCpuPercent: 1, maxDiskSpaceMB: 1, maxNetworkRequests: 1 },
      },
      logger,
    );

    const env = agent.getAcpEnvironment(path.join(home, ".harness-config"));

    expect(env).toMatchObject({ ANTHROPIC_API_KEY: "sk-ant-test", IS_SANDBOX: "1" });
    const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
    expect(settings.permissions.defaultMode).toBe("bypassPermissions");
    expect(settings.attribution).toEqual({ commit: "", pr: "" });
  });
});
