import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpExecutor } from "../src/AcpExecutor";
import { AGENT_ENV_PASSTHROUGH_VAR } from "../src/agentEnvironment";
import { BaseAgent } from "../src/BaseAgent";
import type { AgentCLIResult, BaseAgentConfig, ExecutionContext } from "../src/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "resumingAgent.cjs");
const logger = createLogger({ silent: true, transports: [new transports.Console({ silent: true })] });

/** Runs the scripted ACP agent, whose prompts report 900 input tokens, 600 of them read from the cache. */
class ScriptedAgent extends BaseAgent {
  constructor(private readonly inputIncludesCache: boolean) {
    super(
      { name: "scripted", capabilities: [], costPerExecution: 0, averageSuccessRate: 1, executionTimeLimit: 60, resourceLimits: { maxMemoryMB: 0, maxCpuPercent: 0, maxDiskSpaceMB: 0, maxNetworkRequests: 0 } } satisfies BaseAgentConfig,
      logger,
    );
  }

  getAcpServerCommand(): string[] {
    return [process.execPath, AGENT_SCRIPT];
  }

  override getAcpEnvironment(): NodeJS.ProcessEnv {
    return { AGENT_PROMPT_USAGE: "900/50/600", [AGENT_ENV_PASSTHROUGH_VAR]: "AGENT_PROMPT_USAGE" };
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

function context(): ExecutionContext {
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
  };
}

describe("AcpExecutor usage", () => {
  it("records the input a harness reports when it counts cached tokens apart", async () => {
    const result = await new AcpExecutor(logger).execute(new ScriptedAgent(false), "Write the plan", context());
    expect(result.usage).toMatchObject({ inputTokens: 900, outputTokens: 50, cacheReadInputTokens: 600 });
  });

  it("takes cached tokens out of the input of a harness that counts them in it", async () => {
    const result = await new AcpExecutor(logger).execute(new ScriptedAgent(true), "Write the plan", context());
    expect(result.usage).toMatchObject({ inputTokens: 300, outputTokens: 50, cacheReadInputTokens: 600 });
  });
});
