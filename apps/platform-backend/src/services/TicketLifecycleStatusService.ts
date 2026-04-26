import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Ticket,
  type TicketLifecycleStatus,
} from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";

export class TicketLifecycleStatusService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentDAO = new TicketPhaseDocumentDAO();

  async synchronize(ticketId: string): Promise<TicketLifecycleStatus> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const nextStatus = await this.deriveStatus(ticket);
    if (ticket.status !== nextStatus) {
      await this.ticketDAO.updateTicket(ticketId, { status: nextStatus });
    }

    return nextStatus;
  }

  private async deriveStatus(
    ticket: Pick<Ticket, "id" | "status" | "workflowPhase">,
  ): Promise<TicketLifecycleStatus> {
    if (ticket.status === TICKET_STATUS.RESOLVED) {
      return TICKET_STATUS.RESOLVED;
    }

    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION) {
      const hasExecutionJob = await this.ticketDAO.hasExecutionJob(ticket.id);
      return hasExecutionJob
        ? TICKET_STATUS.IN_PROGRESS
        : TICKET_STATUS.OPEN;
    }

    const document = await this.documentDAO.getByTicketAndPhase(
      ticket.id,
      ticket.workflowPhase,
    );
    if (!document) {
      return TICKET_STATUS.OPEN;
    }

    if (document.approvalState === "approval_requested") {
      return TICKET_STATUS.IN_REVIEW;
    }

    if (document.content.trim().length > 0) {
      return TICKET_STATUS.IN_PROGRESS;
    }

    return TICKET_STATUS.OPEN;
  }
}
