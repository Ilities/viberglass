import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Ticket,
  type TicketLifecycleStatus,
} from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";

/**
 * Keeps a ticket's status true to what is happening: in progress only while
 * an agent is working, in review while a result waits on a human, and open
 * otherwise. Call it whenever a run or the current phase document changes.
 */
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
    ticket: Pick<Ticket, "id" | "status" | "workflowPhase" | "pullRequestUrl">,
  ): Promise<TicketLifecycleStatus> {
    if (ticket.status === TICKET_STATUS.RESOLVED) {
      return TICKET_STATUS.RESOLVED;
    }

    if (await this.ticketDAO.hasRunningJob(ticket.id)) {
      return TICKET_STATUS.IN_PROGRESS;
    }

    return (await this.hasResultAwaitingReview(ticket))
      ? TICKET_STATUS.IN_REVIEW
      : TICKET_STATUS.OPEN;
  }

  private async hasResultAwaitingReview(
    ticket: Pick<Ticket, "id" | "workflowPhase" | "pullRequestUrl">,
  ): Promise<boolean> {
    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.EXECUTION) {
      return Boolean(ticket.pullRequestUrl);
    }

    const document = await this.documentDAO.getByTicketAndPhase(
      ticket.id,
      ticket.workflowPhase,
    );
    return (
      document !== null &&
      document.approvalState !== "approved" &&
      document.content.trim().length > 0
    );
  }
}
