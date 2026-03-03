import { TICKET_WORKFLOW_PHASE, type Ticket } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";

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
      throw new Error("workflow override reason is required");
    }

    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    if (ticket.workflowOverriddenAt) {
      throw new Error("Ticket workflow has already been overridden");
    }

    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION) {
      throw new Error("Ticket is already in the execution phase");
    }

    await this.ticketDAO.overrideWorkflowToExecution(
      ticketId,
      normalizedReason,
      actor,
    );
    await this.lifecycleStatusService.synchronize(ticketId);

    const updatedTicket = await this.ticketDAO.getTicket(ticketId);
    if (!updatedTicket) {
      throw new Error("Ticket not found");
    }

    return updatedTicket;
  }
}
