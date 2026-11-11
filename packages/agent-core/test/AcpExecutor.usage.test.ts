import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpExecutor } from "../src/AcpExecutor";
import { AGENT_ENV_PASSTHROUGH_VAR } from "../src/agentEnvironment";
import { BaseAgent } from "../src/BaseAgent";
import { AcpTurnFailedError } from "../src/acp/AcpTurnFailedError";
import type { AcpTurnTokenReader } from "../src/acp/AcpTurnTokenReader";
import type { AgentCLIResult, BaseAgentConfig, ExecutionContext } from "../src/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "resumingAgent.cjs");
const logger = createLogger({ silent: true, transports: [new transports.Console({ silent: true })] });

/** Runs the scripted ACP agent, whose prompts report 900 input tokens, 600 of them read from the cache. */
class ScriptedAgent extends BaseAgent {
  constructor(
    private readonly inputIncludesCache: boolean,
    private readonly options: { turnFailure?: string; recordedError?: string; turnTokens?: AcpTurnTokenReader; env?: Record<string, string> } = {},
  ) {
    super(
      { name: "scripted", capabilities: [], costPerExecution: 0, averageSuccessRate: 1, executionTimeLimit: 60, resourceLimits: { maxMemoryMB: 0, maxCpuPercent: 0, maxDiskSpaceMB: 0, maxNetworkRequests: 0 } } satisfies BaseAgentConfig,
      logger,
    );
  }

  override getAcpTurnTokens(): AcpTurnTokenReader | undefined {
    return this.options.turnTokens;
  }

  override async acpTurnError(): Promise<string | undefined> {
    return this.options.recordedError;
  }

  getAcpServerCommand(): string[] {
    return [process.execPath, AGENT_SCRIPT];
  }

  override getAcpEnvironment(): NodeJS.ProcessEnv {
    const failure = this.options.turnFailure ? { AGENT_TURN_FAILURE: this.options.turnFailure } : {};
    const env = { AGENT_PROMPT_USAGE: "900/50/600", ...failure, ...this.options.env };
    return { ...env, [AGENT_ENV_PASSTHROUGH_VAR]: Object.keys(env).join(",") };
  }

  override acpInputIncludesCache(): boolean {
    return this.inputIncludesCache;
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  protected async executeAgentCLI(): Promise<AgentCLIResult> {
    return { success: true };
  }
}

function context(acpSessionId?: string): ExecutionContext {
  return {
    repoUrl: "",
    branch: "main",
    repoDir: process.cwd(),
    commitHash: "",
    bugDescription: "",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    maxChanges: 0,
    testRequired: false,
    runTests: false,
    maxExecutionTime: 30,
    acpSessionId,
  };
}

describe("AcpExecutor usage", () => {
  it("records the input a harness reports when it counts cached tokens apart", async () => {
    const result = await new AcpExecutor(logger).execute(new ScriptedAgent(false), "Write the plan", context());
    expect(result.usage).toMatchObject({ inputTokens: 900, outputTokens: 50, cacheReadInputTokens: 600 });
    expect(result.usage).not.toHaveProperty("costUsd");
    expect(result.cost).toBeUndefined();
  });

  it("takes cached tokens out of the input of a harness that counts them in it", async () => {
    const result = await new AcpExecutor(logger).execute(new ScriptedAgent(true), "Write the plan", context());
    expect(result.usage).toMatchObject({ inputTokens: 300, outputTokens: 50, cacheReadInputTokens: 600 });
  });

  it("keeps what a failed turn's model calls used", async () => {
    const agent = new ScriptedAgent(true, { turnFailure: "error:exceeded retry limit, last status: 429 Too Many Requests" });

    const error: unknown = await new AcpExecutor(logger).execute(agent, "Write the plan", context()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AcpTurnFailedError);
    expect(error).toMatchObject({ message: expect.stringContaining("429 Too Many Requests"), usage: { inputTokens: 300, outputTokens: 50, cacheReadInputTokens: 600 } });
  });

  it("keeps the usage of a turn the harness ended normally but recorded as failed", async () => {
    const agent = new ScriptedAgent(false, { recordedError: "401: Incorrect API key provided." });

    await expect(new AcpExecutor(logger).execute(agent, "Write the plan", context())).rejects.toMatchObject({
      message: "401: Incorrect API key provided.",
      usage: { inputTokens: 900, outputTokens: 50 },
    });
  });

  it("counts every model call the harness recorded, not just what ACP reported for the last one", async () => {
    const since = jest.fn().mockReturnValue({ inputTokens: 5400, outputTokens: 2100, cacheReadInputTokens: 410_000 });
    const agent = new ScriptedAgent(false, { turnTokens: { since } });
    const startedAt = Date.now();

    const result = await new AcpExecutor(logger).execute(agent, "Write the plan", context());

    expect(result.usage).toMatchObject({ inputTokens: 5400, outputTokens: 2100, cacheReadInputTokens: 410_000 });
    expect(since).toHaveBeenCalledWith(["sess_new"], expect.any(Number));
    expect(since.mock.calls[0][1]).toBeGreaterThanOrEqual(startedAt);
  });

  it("counts what the continued session used before it failed, as well as the fresh session the turn started over in", async () => {
    const since = jest.fn().mockReturnValue({ inputTokens: 52_000, outputTokens: 7_400, costUsd: 0.4 });
    const env = { AGENT_SUPPORTS: "resume", AGENT_KNOWS: "sess_old", AGENT_FAIL_FIRST_PROMPT: "1" };
    const agent = new ScriptedAgent(false, { turnTokens: { since }, env });

    const result = await new AcpExecutor(logger).execute(agent, "Write the plan", context("sess_old"));

    expect(result.newAcpSessionId).toBe("sess_new");
    expect(since).toHaveBeenCalledWith(["sess_old", "sess_new"], expect.any(Number));
    expect(result.usage).toMatchObject({ inputTokens: 52_000, outputTokens: 7_400, costUsd: 0.4 });
  });
});
