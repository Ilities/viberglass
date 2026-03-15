import { Logger } from "winston";
import { AcpClient } from "../acp/AcpClient";
import type { BaseAgent } from "../agents";
import type { ExecutionContext, ExecutionResult } from "../types";

export class AcpExecutor {
  constructor(private readonly logger: Logger) {}

  async execute(
    agent: BaseAgent,
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const command = agent.getAcpServerCommand();
    const repoDir = context.repoDir ?? process.cwd();
    const env: NodeJS.ProcessEnv = { ...process.env };
    const timeoutMs = (context.maxExecutionTime || 1800) * 1000;

    const client = new AcpClient(
      command,
      repoDir,
      env,
      (event) => context.onAcpEvent?.(event),
      this.logger,
      timeoutMs,
    );

    const result = await client.run({
      userMessage: prompt,
      acpSessionId: context.acpSessionId,
    });

    return {
      success: true,
      changedFiles: [],
      executionTime: 0,
      cost: 0,
      acpTurnOutcome: result.turnOutcome,
      newAcpSessionId: result.acpSessionId,
    };
  }
}
