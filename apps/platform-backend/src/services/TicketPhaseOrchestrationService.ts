import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from "@viberglass/types";
import logger from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentService } from "./TicketPhaseDocumentService";
import { TicketWorkflowService } from "./TicketWorkflowService";
import { TicketPlanningApprovalService } from "./TicketPlanningApprovalService";
import { TicketResearchService } from "./TicketResearchService";
import { TicketPlanningService } from "./TicketPlanningService";
import { TicketExecutionService } from "./TicketExecutionService";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";

export interface AdvanceAndRunParams {
  ticketId: string;
  clankerId: string;
  targetPhase: TicketWorkflowPhase;
  actor?: string;
}

export interface AdvanceAndRunChainParams {
  ticketId: string;
  clankerId: string;
  firstPhase: TicketWorkflowPhase;
  thenPhase: TicketWorkflowPhase;
  actor?: string;
}

export type AdvanceAndRunResult = { jobId: string; status: string };

/**
 * Single orchestration entry point for "advance a ticket to target phase and
 * run that phase's job". Composes workflow, approval, and phase-run services.
 */
export class TicketPhaseOrchestrationService {
  private readonly documentService = new TicketPhaseDocumentService();

  constructor(
    private readonly ticketDAO: TicketDAO,
    private readonly workflowService: TicketWorkflowService,
    private readonly planningApprovalService: TicketPlanningApprovalService,
    private readonly researchService: TicketResearchService,
    private readonly planningService: TicketPlanningService,
    private readonly executionService: TicketExecutionService,
  ) {}

  async advanceAndRun(
    params: AdvanceAndRunParams,
  ): Promise<AdvanceAndRunResult> {
    const { ticketId, clankerId, targetPhase, actor } = params;

    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    if (targetPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
      await this.workflowService.setPhase(ticketId, TICKET_WORKFLOW_PHASE.RESEARCH);
      return this.researchService.runResearch(ticketId, { clankerId });
    }

    if (targetPhase === TICKET_WORKFLOW_PHASE.PLANNING) {
      await this.workflowService.setPhase(ticketId, TICKET_WORKFLOW_PHASE.PLANNING);
      return this.planningService.runPlanning(ticketId, { clankerId });
    }

    // EXECUTION: must go through the canonical approval path so the planning
    // document's approvalState is set, approval actions are recorded, and the
    // feedback webhook fires.
    const planningDoc = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    const alreadyApproved = planningDoc.approvalState === "approved";
    const alreadyInExecution =
      ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION;

    if (!alreadyApproved || !alreadyInExecution) {
      await this.planningApprovalService.approve(ticketId, actor);
    }

    return this.executionService.runTicket(ticketId, { clankerId });
  }

  /**
   * Chain: run `firstPhase` now and signal the bridge to auto-advance to
   * `thenPhase` on completion. Returns the first jobId; the caller is
   * responsible for starting a bridge with `chainTo = thenPhase`.
   */
  async advanceAndRunChain(
    params: AdvanceAndRunChainParams,
  ): Promise<AdvanceAndRunResult> {
    const { ticketId, clankerId, firstPhase, actor } = params;

    logger.info("Starting chained phase run", {
      ticketId,
      firstPhase,
      thenPhase: params.thenPhase,
    });

    return this.advanceAndRun({
      ticketId,
      clankerId,
      targetPhase: firstPhase,
      actor,
    });
  }
}
