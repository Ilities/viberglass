import { TICKET_WORKFLOW_PHASE, type Ticket } from "@viberglass/types";
import type { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { TicketPhaseApprovalDAO } from "../persistence/ticketing/TicketPhaseApprovalDAO";
import { TicketServiceError, TICKET_SERVICE_ERROR_CODE } from "./errors/TicketServiceError";
import type { TicketPhaseDocumentService } from "./TicketPhaseDocumentService";
import type { TicketPhaseRunGuard } from "./TicketPhaseRunGuard";
import type { TicketWorkflowService } from "./TicketWorkflowService";

export type ReopenableStep = "research" | "planning";

const STEP_ORDER = [TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_WORKFLOW_PHASE.PLANNING, TICKET_WORKFLOW_PHASE.EXECUTION];

/**
 * Takes a task back to an earlier step so it can be iterated on. Documents
 * are kept: the reopened step's document and every later one go back to
 * awaiting approval, and an open pull request stays open for the next build
 * to update.
 */
export class TicketStepReopenService {
  constructor(
    private readonly tickets: Pick<TicketDAO, "getTicket">,
    private readonly workflow: Pick<TicketWorkflowService, "setPhase">,
    private readonly documents: Pick<TicketPhaseDocumentService, "getOrCreateDocument" | "requestApproval">,
    private readonly approvals: Pick<TicketPhaseApprovalDAO, "recordApprovalAction">,
    private readonly runGuard: Pick<TicketPhaseRunGuard, "assertIdle">,
  ) {}

  async reopen(ticketId: string, step: ReopenableStep, actorId: string | null): Promise<Ticket> {
    const ticket = await this.tickets.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    }
    if (STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(ticket.workflowPhase)) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.STEP_REOPEN_INVALID,
        `The ${step} step is not behind the task's current step, so there is nothing to reopen`,
      );
    }
    await this.runGuard.assertIdle(ticket.id);

    for (const phase of [TICKET_WORKFLOW_PHASE.RESEARCH, TICKET_WORKFLOW_PHASE.PLANNING]) {
      if (STEP_ORDER.indexOf(phase) < STEP_ORDER.indexOf(step)) continue;
      const document = await this.documents.getOrCreateDocument(ticketId, phase);
      if (!document.content.trim()) continue;
      await this.documents.requestApproval(ticketId, phase);
      await this.approvals.recordApprovalAction(ticketId, phase, "revoked", actorId, `Reopened the ${step} step`);
    }

    return this.workflow.setPhase(ticketId, step);
  }
}
