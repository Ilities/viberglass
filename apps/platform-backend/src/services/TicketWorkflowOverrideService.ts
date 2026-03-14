import { TICKET_WORKFLOW_PHASE, type Ticket } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";

export class TicketWorkflowOverrideService {
  private readonly ticketDAO = new TicketDAO();
  private readonly lifecycleStatusService = new TicketLifecycleStatusService();

  async overrideToExecution(
    ticketId: string,
    reason: string,
    actor?: string,
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

    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.WORKFLOW_ALREADY_IN_EXECUTION,
        "Ticket is already in the execution phase",
      );
    }

    await this.ticketDAO.overrideWorkflowToExecution(
      ticketId,
      normalizedReason,
      actor,
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
