import * as path from "path";
import { Logger } from "winston";
import { AcpClient } from "./acp/AcpClient";
import type { AcpEventMapper } from "./acp/acpEventMapperTypes";
import type { BaseAgent } from "./BaseAgent";
import type { ExecutionContext, ExecutionResult } from "./types";

export class AcpExecutor {
  constructor(
    private readonly logger: Logger,
    private readonly mapper?: AcpEventMapper,
  ) {}

  async execute(
    agent: BaseAgent,
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const command = agent.getAcpServerCommand();
    const repoDir = context.repoDir ?? process.cwd();
    const workDir = path.dirname(repoDir);
    const harnessConfigDir = path.join(workDir, ".harness-config");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...agent.getAcpEnvironment(harnessConfigDir),
    };

    env.HOME = agent.resolveHomeDirectory(env.HOME);

    const timeoutMs = (context.maxExecutionTime || 1800) * 1000;

    this.logger.info("AcpExecutor starting", {
      command: command.join(" "),
      repoDir,
      timeoutMs,
      agentSessionId: context.agentSessionId,
      acpSessionId: context.acpSessionId,
      env: { HOME: env.HOME },
    });

    const client = new AcpClient(
      command,
      repoDir,
      env,
      (event) => context.onAcpEvent?.(event),
      this.logger,
      timeoutMs,
      this.mapper,
    );

    try {
      const result = await client.run({
        userMessage: prompt,
        acpSessionId: context.acpSessionId,
      });

      this.logger.info("AcpExecutor completed", {
        turnOutcome: result.turnOutcome,
        acpSessionId: result.acpSessionId,
      });

      return {
        success: true,
        changedFiles: [],
        executionTime: 0,
        cost: 0,
        acpTurnOutcome: result.turnOutcome,
        newAcpSessionId: result.acpSessionId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("AcpExecutor failed", {
        command: command.join(" "),
        error: message,
        agentSessionId: context.agentSessionId,
      });
      throw error;
    }
  }
}
