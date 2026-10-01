import { type ApprovalStep } from "@viberglass/types";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TicketPhaseApprovalDAO } from "../../persistence/ticketing/TicketPhaseApprovalDAO";
import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";
import { TicketPhaseDocumentService, type PhaseDocumentView } from "../TicketPhaseDocumentService";
import { TaskParticipantService } from "../tasks/TaskParticipantService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  documents: Pick<TicketPhaseDocumentService, "requestApproval">;
  approvals: Pick<TicketPhaseApprovalDAO, "recordApprovalAction">;
  participants: Pick<TaskParticipantService, "add">;
}

/**
 * "Request approval from…" (J7): puts the step's document up for review and
 * adds the people asked as reviewers, which sends each a review request and
 * lets them approve under the policy.
 */
export class StepApprovalRequestService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      documents: new TicketPhaseDocumentService(),
      approvals: new TicketPhaseApprovalDAO(),
      participants: new TaskParticipantService(),
      ...deps,
    };
  }

  async request(ticketId: string, step: ApprovalStep, actorId: string, reviewerIds: string[]): Promise<PhaseDocumentView> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    if (!ticket) throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    if (ticket.workflowPhase !== step) {
      throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.APPROVAL_INVALID_STEP, `This task isn't at the ${step === "research" ? "research" : "plan"} step.`);
    }
    for (const reviewerId of new Set(reviewerIds)) {
      await this.deps.participants.add(ticketId, reviewerId, "reviewer", actorId);
    }
    const document = await this.deps.documents.requestApproval(ticketId, step);
    await this.deps.approvals.recordApprovalAction(ticketId, step, "approval_requested", actorId);
    return document;
  }
}
