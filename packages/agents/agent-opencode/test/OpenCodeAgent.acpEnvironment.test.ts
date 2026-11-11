import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import { OpenCodeAgent } from "../src/OpenCodeAgent";
import type { OpenCodeConfig } from "../src/config";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });

function agent(config: Partial<OpenCodeConfig> = {}): OpenCodeAgent {
  return new OpenCodeAgent(
    {
      name: "opencode",
      apiKey: "",
      capabilities: [],
      costPerExecution: 0,
      averageSuccessRate: 0,
      executionTimeLimit: 60,
      resourceLimits: { maxMemoryMB: 1, maxCpuPercent: 1, maxDiskSpaceMB: 1, maxNetworkRequests: 1 },
      ...config,
    },
    logger,
  );
}

describe("OpenCodeAgent ACP environment", () => {
  const saved = { model: process.env.OPENCODE_MODEL, content: process.env.OPENCODE_CONFIG_CONTENT, dir: process.env.OPENCODE_CONFIG_DIR };
  let workDir: string;
  let harnessConfigDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-env-"));
    harnessConfigDir = path.join(workDir, ".harness-config");
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
    if (saved.dir === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = saved.dir;
    if (saved.model === undefined) delete process.env.OPENCODE_MODEL;
    else process.env.OPENCODE_MODEL = saved.model;
    if (saved.content === undefined) delete process.env.OPENCODE_CONFIG_CONTENT;
    else process.env.OPENCODE_CONFIG_CONTENT = saved.content;
  });

  it("gives OpenCode the runner's model as its main and small model", () => {
    delete process.env.OPENCODE_CONFIG_CONTENT;
    process.env.OPENCODE_MODEL = "opencode-go/deepseek-v4.1-flash";

    const env = agent().getAcpEnvironment(harnessConfigDir);

    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}")).toEqual({
      model: "opencode-go/deepseek-v4.1-flash",
      small_model: "opencode-go/deepseek-v4.1-flash",
    });
  });

  it("keeps a model endpoint's provider config and model", () => {
    process.env.OPENCODE_MODEL = "viberglass/qwen";
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ model: "viberglass/qwen", provider: { viberglass: {} } });

    const env = agent({ model: "opencode-go/kimi-k3" }).getAcpEnvironment(harnessConfigDir);

    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}")).toEqual({
      model: "viberglass/qwen",
      small_model: "viberglass/qwen",
      provider: { viberglass: {} },
    });
  });

  it("leaves OpenCode's config alone when the runner names no model", () => {
    delete process.env.OPENCODE_MODEL;
    delete process.env.OPENCODE_CONFIG_CONTENT;

    expect(agent().getAcpEnvironment(harnessConfigDir).OPENCODE_CONFIG_CONTENT).toBeUndefined();
  });

  it("loads the retry and token recorders from the run's harness config when it has one", () => {
    fs.mkdirSync(harnessConfigDir);
    process.env.OPENCODE_CONFIG_DIR = path.join(workDir, "image-config");

    const env = agent().getAcpEnvironment(harnessConfigDir);

    expect(env.OPENCODE_CONFIG_DIR).toBe(harnessConfigDir);
    expect(fs.existsSync(path.join(harnessConfigDir, "plugin", "viberglass-retries.js"))).toBe(true);
    expect(fs.existsSync(path.join(harnessConfigDir, "plugin", "viberglass-tokens.js"))).toBe(true);
  });

  it("loads the retry recorder from the image's config directory otherwise", () => {
    process.env.OPENCODE_CONFIG_DIR = path.join(workDir, "image-config");

    const env = agent().getAcpEnvironment(harnessConfigDir);

    expect(env.OPENCODE_CONFIG_DIR).toBe(path.join(workDir, "image-config"));
    expect(fs.existsSync(path.join(workDir, "image-config", "plugin", "viberglass-retries.js"))).toBe(true);
  });
});
