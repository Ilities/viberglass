import type { TicketWorkflowPhase } from "@viberglass/types";
import logger from "../config/logger";
import type { TaskTurnService } from "./taskTurns/TaskTurnService";
import { ACTION_FOR_PHASE } from "./taskTurns/turnActions";

export interface AdvanceAndRunParams {
  ticketId: string;
  clankerId: string;
  targetPhase: TicketWorkflowPhase;
  /** Who is asking; asking for the build is limited to those who may ask for code. */
  actorId: string | null;
}

export interface AdvanceAndRunChainParams {
  ticketId: string;
  clankerId: string;
  firstPhase: TicketWorkflowPhase;
  thenPhase: TicketWorkflowPhase;
  actorId: string | null;
}

export type AdvanceAndRunResult = { jobId: string; status: string };

/**
 * "Do this step now" for chat and MCP: asks the agent for the step's work.
 * Nothing is approved on the way; the ask is the agreement.
 */
export class TicketPhaseOrchestrationService {
  constructor(private readonly turns: Pick<TaskTurnService, "ask">) {}

  async advanceAndRun(params: AdvanceAndRunParams): Promise<AdvanceAndRunResult> {
    const { ticketId, clankerId, targetPhase, actorId } = params;
    const asked = await this.turns.ask(ticketId, actorId, { message: "", action: ACTION_FOR_PHASE[targetPhase], agentId: clankerId });
    if (!asked.job.id) throw new Error("The agent's turn has no run yet");
    return { jobId: asked.job.id, status: asked.job.status };
  }

  /**
   * Chain: run `firstPhase` now and signal the bridge to auto-advance to
   * `thenPhase` on completion. Returns the first jobId; the caller is
   * responsible for starting a bridge with `chainTo = thenPhase`.
   */
  async advanceAndRunChain(params: AdvanceAndRunChainParams): Promise<AdvanceAndRunResult> {
    const { ticketId, clankerId, firstPhase, actorId } = params;

    logger.info("Starting chained phase run", {
      ticketId,
      firstPhase,
      thenPhase: params.thenPhase,
    });

    return this.advanceAndRun({
      ticketId,
      clankerId,
      targetPhase: firstPhase,
      actorId,
    });
  }
}
