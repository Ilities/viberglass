import * as path from "path";
import { Logger } from "winston";
import { AcpClient } from "./acp/AcpClient";
import type { AcpEventMapper } from "./acp/acpEventMapperTypes";
import type { BaseAgent } from "./BaseAgent";
import { sanitizeAgentEnvironment } from "./agentEnvironment";
import type { ExecutionContext, ExecutionResult } from "./types";
import { withUncachedInput, type AgentUsageReport } from "./usage";
import { AcpTurnFailedError } from "./acp/AcpTurnFailedError";

export class AcpExecutor {
  constructor(
    private readonly logger: Logger,
    private readonly mapper?: AcpEventMapper,
  ) {}

  async execute(
    agent: BaseAgent,
    prompt: string,
    context: ExecutionContext,
    mapperOverride?: AcpEventMapper,
  ): Promise<ExecutionResult> {
    const command = agent.getAcpServerCommand();
    const repoDir = context.repoDir ?? process.cwd();
    const workDir = path.dirname(repoDir);
    const harnessConfigDir = path.join(workDir, ".harness-config");

    const { env, removed } = sanitizeAgentEnvironment({
      ...process.env,
      ...agent.getAcpEnvironment(harnessConfigDir),
    });

    if (removed.length > 0) {
      this.logger.debug("Withheld environment variables from ACP agent", {
        count: removed.length,
        names: removed,
      });
    }

    env.HOME = agent.resolveHomeDirectory(env.HOME);
    const mcpServers = await agent.configureMcpServers(context.mcpServers ?? [], env);

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
      mapperOverride ?? this.mapper,
      agent.getAcpUsageProbe(),
    );

    try {
      const result = await client.run({
        userMessage: prompt,
        acpSessionId: context.acpSessionId,
        coldStartMessage: context.coldStartPrompt,
        compactInstructions: context.compactInstructions,
        mcpServers,
        providerRetries: agent.getAcpProviderRetries(harnessConfigDir),
        turnTokens: agent.getAcpTurnTokens(harnessConfigDir),
      });

      const turnError = await agent.acpTurnError(result.acpSessionId);
      if (turnError) throw new AcpTurnFailedError(turnError, result.usage, result.model);

      // Only a model the harness named; the runner's own setting is recorded apart, as the requested model.
      const model = result.model ?? result.usage?.model;

      this.logger.info("AcpExecutor completed", {
        acpSessionId: result.acpSessionId,
        sessionStart: result.sessionStart,
      });

      return {
        success: true,
        changedFiles: [],
        executionTime: 0,
        cost: 0,
        newAcpSessionId: result.acpSessionId,
        acpSessionStart: result.sessionStart,
        acpContextUsage: result.contextUsage,
        acpCompacted: result.compacted,
        usage: countedUsage(agent, result.usage, model),
        model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("AcpExecutor failed", {
        command: command.join(" "),
        error: message,
        agentSessionId: context.agentSessionId,
      });
      if (!(error instanceof AcpTurnFailedError)) throw error;
      const model = error.model ?? error.usage?.model;
      throw new AcpTurnFailedError(message, countedUsage(agent, error.usage, model), model);
    }
  }
}

/** The usage as the platform counts it: input without cached tokens, and the model the turn ran on. */
function countedUsage(agent: BaseAgent, usage: AgentUsageReport | undefined, model: string | undefined): AgentUsageReport | undefined {
  if (!usage) return undefined;
  const counted = agent.acpInputIncludesCache() ? withUncachedInput(usage) : usage;
  return { ...counted, model: model ?? counted.model };
}
