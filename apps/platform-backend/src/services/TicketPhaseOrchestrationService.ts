import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from "@viberglass/types";
import logger from "../config/logger";
import type { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentService } from "./TicketPhaseDocumentService";
import type { TicketWorkflowService } from "./TicketWorkflowService";
import type { TicketPlanningApprovalService } from "./TicketPlanningApprovalService";
import type { TaskTurnService } from "./taskTurns/TaskTurnService";
import { ACTION_FOR_PHASE } from "./taskTurns/turnActions";
import type { TicketResearchApprovalService } from "./approvals/TicketResearchApprovalService";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";

export interface AdvanceAndRunParams {
  ticketId: string;
  clankerId: string;
  targetPhase: TicketWorkflowPhase;
  /** Who is moving the task on; any approval it takes is theirs, under the space's policy. */
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
 * Single orchestration entry point for "advance a ticket to target phase and
 * run that phase's job". Composes workflow, approval, and phase-run services.
 */
export class TicketPhaseOrchestrationService {
  private readonly documentService = new TicketPhaseDocumentService();

  constructor(
    private readonly ticketDAO: Pick<TicketDAO, "getTicket">,
    private readonly workflowService: Pick<TicketWorkflowService, "setPhase">,
    private readonly planningApprovalService: Pick<TicketPlanningApprovalService, "approve">,
    private readonly researchApprovalService: Pick<TicketResearchApprovalService, "approve">,
    private readonly turns: Pick<TaskTurnService, "ask">,
  ) {}

  async advanceAndRun(
    params: AdvanceAndRunParams,
  ): Promise<AdvanceAndRunResult> {
    const { ticketId, clankerId, targetPhase, actorId } = params;
    await this.approveUpTo(ticketId, targetPhase, actorId);
    if (targetPhase !== TICKET_WORKFLOW_PHASE.EXECUTION) {
      await this.workflowService.setPhase(ticketId, targetPhase);
    }
    const asked = await this.turns.ask(ticketId, actorId, { message: "", action: ACTION_FOR_PHASE[targetPhase], agentId: clankerId });
    if (!asked.job.id) throw new Error("The agent's turn has no run yet");
    return { jobId: asked.job.id, status: asked.job.status };
  }

  /**
   * Takes every approval between the task's step and `targetPhase`, as the
   * person moving it on: the research when leaving it, and the plan before the
   * build. Each goes through the canonical approval path, so the policy is
   * checked, the approval recorded and the feedback webhook fired. Going back
   * to an earlier step needs no approval.
   */
  async approveUpTo(ticketId: string, targetPhase: TicketWorkflowPhase, actorId: string | null): Promise<void> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (targetPhase === TICKET_WORKFLOW_PHASE.RESEARCH) return;

    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
      await this.researchApprovalService.approve(ticketId, actorId);
    }
    if (targetPhase !== TICKET_WORKFLOW_PHASE.EXECUTION || ticket.workflowOverriddenAt) return;

    const planningDoc = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    const alreadyInExecution = ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION;
    if (planningDoc.approvalState !== "approved" || !alreadyInExecution) {
      await this.planningApprovalService.approve(ticketId, actorId);
    }
  }

  /**
   * Chain: run `firstPhase` now and signal the bridge to auto-advance to
   * `thenPhase` on completion. Returns the first jobId; the caller is
   * responsible for starting a bridge with `chainTo = thenPhase`.
   */
  async advanceAndRunChain(
    params: AdvanceAndRunChainParams,
  ): Promise<AdvanceAndRunResult> {
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
