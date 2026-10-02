import type { AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import logger from "../../config/logger";
import type { TaskTurnService } from "./TaskTurnService";

export interface ContextThreshold {
  /** Summarise once the context is this full, when the harness says how big it is. */
  ratio: number;
  /** Else once it holds this many tokens. */
  tokens: number;
}

function thresholdFromEnv(env: NodeJS.ProcessEnv): ContextThreshold {
  const ratio = Number(env.TASK_SUMMARY_CONTEXT_RATIO);
  const tokens = Number(env.TASK_SUMMARY_CONTEXT_TOKENS);
  return {
    ratio: Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : 0.6,
    tokens: Number.isFinite(tokens) && tokens > 0 ? tokens : 120_000,
  };
}

/**
 * Past a context threshold, measured from the turn's reported usage, asks the
 * same agent for a summary of the conversation (S6). The summarise turn then
 * compacts the harness's context where it can; other harnesses read the
 * summary at their next cold start.
 */
export class TaskAutoSummariser {
  constructor(
    private readonly turns: Pick<TaskTurnService, "ask">,
    private readonly threshold: ContextThreshold = thresholdFromEnv(process.env),
  ) {}

  isPast(usage: { used: number; size: number | null } | undefined): boolean {
    if (!usage) return false;
    return usage.size ? usage.used / usage.size >= this.threshold.ratio : usage.used >= this.threshold.tokens;
  }

  /** Never fails the turn it follows: a missed summary waits for the next one, or for someone to ask. */
  async afterTurn(
    session: Pick<AgentSession, "ticketId" | "clankerId">,
    turn: Pick<AgentTurn, "action">,
    usage: { used: number; size: number | null } | undefined,
  ): Promise<boolean> {
    if (turn.action === "summarise" || !this.isPast(usage)) return false;
    try {
      await this.turns.ask(session.ticketId, null, { message: "", action: "summarise", agentId: session.clankerId });
      return true;
    } catch (error) {
      logger.warn("Could not start the summary a full context called for", {
        ticketId: session.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
