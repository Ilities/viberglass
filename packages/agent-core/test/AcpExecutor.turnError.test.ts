import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpExecutor } from "../src/AcpExecutor";
import { BaseAgent } from "../src/BaseAgent";
import type { AgentCLIResult, BaseAgentConfig, ExecutionContext } from "../src/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "resumingAgent.cjs");
const logger = createLogger({ silent: true, transports: [new transports.Console({ silent: true })] });

/** Runs the scripted ACP agent, which ends every turn normally, and says what its harness recorded. */
class ScriptedAgent extends BaseAgent {
  constructor(private readonly recordedError: string | undefined) {
    super(
      { name: "scripted", capabilities: [], costPerExecution: 0, averageSuccessRate: 1, executionTimeLimit: 60, resourceLimits: { maxMemoryMB: 0, maxCpuPercent: 0, maxDiskSpaceMB: 0, maxNetworkRequests: 0 } } satisfies BaseAgentConfig,
      logger,
    );
  }

  getAcpServerCommand(): string[] {
    return [process.execPath, AGENT_SCRIPT];
  }

  override async acpTurnError(): Promise<string | undefined> {
    return this.recordedError;
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

describe("AcpExecutor", () => {
  it("fails a turn the harness ended normally when it recorded an error, as pi-acp does with a rejected key", async () => {
    const agent = new ScriptedAgent("401: Incorrect API key provided.");
    await expect(new AcpExecutor(logger).execute(agent, "Write the plan", context())).rejects.toThrow("401: Incorrect API key provided.");
  });

  it("succeeds when the harness recorded no error", async () => {
    const result = await new AcpExecutor(logger).execute(new ScriptedAgent(undefined), "Write the plan", context());
    expect(result.success).toBe(true);
  });
});
