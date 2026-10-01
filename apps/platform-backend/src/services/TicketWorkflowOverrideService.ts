import { type Ticket } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "./errors/TicketServiceError";
import { ApprovalPolicyService } from "./approvals/ApprovalPolicyService";

export class TicketWorkflowOverrideService {
  private readonly ticketDAO = new TicketDAO();
  private readonly lifecycleStatusService = new TicketLifecycleStatusService();

  constructor(
    private readonly policy: Pick<ApprovalPolicyService, "assertCanApprove"> = new ApprovalPolicyService(),
  ) {}

  /** Skipping to the build skips the plan's approval, so it needs the right to give it. */
  async overrideToExecution(
    ticketId: string,
    reason: string,
    actorId: string | null,
  ): Promise<Ticket> {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.WORKFLOW_OVERRIDE_REASON_REQUIRED,
        "workflow override reason is required",
      );
    }

    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    if (ticket.workflowOverriddenAt) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.WORKFLOW_ALREADY_OVERRIDDEN,
        "Ticket workflow has already been overridden",
      );
    }
    await this.policy.assertCanApprove(actorId, ticketId, "planning");

    await this.ticketDAO.overrideWorkflowToExecution(
      ticketId,
      normalizedReason,
      actorId ?? undefined,
    );
    await this.lifecycleStatusService.synchronize(ticketId);

    const updatedTicket = await this.ticketDAO.getTicket(ticketId);
    if (!updatedTicket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    return updatedTicket;
  }
}
