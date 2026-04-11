import { BaseAgent, AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";
import type { __PascalName__Config } from "./config";

export class __PascalName__Agent extends BaseAgent {
  protected override config!: __PascalName__Config;

  protected async executeAgentCLI(
    ctx: ExecutionContext,
  ): Promise<AgentCLIResult> {
    // TODO: implement agent execution
    // 1. Build the CLI command (getAcpServerCommand / getAcpEnvironment)
    // 2. Spawn process using ctx.processRunner
    // 3. Stream output via ctx.progressCallback
    // 4. Return { output, exitCode, changedFiles? }
    throw new Error("__PascalName__Agent.executeAgentCLI not implemented");
  }

  getAcpServerCommand(): string[] {
    // TODO: return the CLI command that starts the ACP server
    // e.g. ["__name__", "--acp", "--model", this.config.model ?? "default"]
    throw new Error("getAcpServerCommand not implemented");
  }

  getAcpEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};
    if (this.config.apiKey) {
      env.__NAME_UPPER___API_KEY = this.config.apiKey;
    }
    return env;
  }

  requiresApiKey(): boolean {
    return true;
  }
}
