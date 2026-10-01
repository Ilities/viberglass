import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TicketPhaseApprovalDAO } from "../../persistence/ticketing/TicketPhaseApprovalDAO";
import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import { TicketWorkflowService } from "../TicketWorkflowService";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { ApprovalPolicyService } from "./ApprovalPolicyService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  policy: Pick<ApprovalPolicyService, "assertCanApprove">;
  documents: Pick<TicketPhaseDocumentService, "approveDocument">;
  approvals: Pick<TicketPhaseApprovalDAO, "recordApprovalAction">;
  workflow: Pick<TicketWorkflowService, "advancePhase">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/** Approves a task's research as one person, under the space's policy, and moves it on to the plan. */
export class TicketResearchApprovalService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      policy: new ApprovalPolicyService(),
      documents: new TicketPhaseDocumentService(),
      approvals: new TicketPhaseApprovalDAO(),
      workflow: new TicketWorkflowService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async approve(ticketId: string, actorId: string | null): Promise<void> {
    const ticket = await this.deps.tickets.getTicket(ticketId);
    if (!ticket) throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    if (ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.RESEARCH) {
      throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.APPROVAL_INVALID_STEP, "This task has already moved on from research.");
    }
    await this.deps.policy.assertCanApprove(actorId, ticketId, "research");

    await this.deps.documents.approveDocument(ticketId, TICKET_WORKFLOW_PHASE.RESEARCH, actorId);
    await this.deps.approvals.recordApprovalAction(ticketId, TICKET_WORKFLOW_PHASE.RESEARCH, "approved", actorId, "Research approved");
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, "document_approved", { step: "research" });
    await this.deps.workflow.advancePhase(ticketId, TICKET_WORKFLOW_PHASE.PLANNING);
  }
}
