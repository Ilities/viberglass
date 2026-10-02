import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Ticket,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";

const hasContent = (document: { content: string } | null) => (document?.content.trim().length ?? 0) > 0;

/**
 * Keeps a ticket's phase and status true to what exists. The phase
 * is the furthest artifact: the build once there's a pull request, the plan
 * once one is written, else research. The status is in progress only while an
 * agent is working, in review while an artifact waits on people, and open
 * otherwise. Call it whenever a run or a document changes.
 */
export class TicketLifecycleStatusService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentDAO = new TicketPhaseDocumentDAO();

  async synchronize(ticketId: string): Promise<TicketLifecycleStatus> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const [research, plan] = await Promise.all([
      this.documentDAO.getByTicketAndPhase(ticket.id, TICKET_WORKFLOW_PHASE.RESEARCH),
      this.documentDAO.getByTicketAndPhase(ticket.id, TICKET_WORKFLOW_PHASE.PLANNING),
    ]);
    const phase = derivePhase(ticket, hasContent(plan));
    if (ticket.workflowPhase !== phase) {
      await this.ticketDAO.updateWorkflowPhase(ticketId, phase);
    }

    const hasArtifact = Boolean(ticket.pullRequestUrl) || hasContent(plan) || hasContent(research);
    const nextStatus = await this.deriveStatus(ticket, hasArtifact);
    if (ticket.status !== nextStatus) {
      await this.ticketDAO.updateTicket(ticketId, { status: nextStatus });
    }

    return nextStatus;
  }

  private async deriveStatus(ticket: Pick<Ticket, "id" | "status">, hasArtifact: boolean): Promise<TicketLifecycleStatus> {
    if (ticket.status === TICKET_STATUS.RESOLVED) {
      return TICKET_STATUS.RESOLVED;
    }
    if (await this.ticketDAO.hasRunningJob(ticket.id)) {
      return TICKET_STATUS.IN_PROGRESS;
    }
    return hasArtifact ? TICKET_STATUS.IN_REVIEW : TICKET_STATUS.OPEN;
  }
}

export function derivePhase(ticket: Pick<Ticket, "pullRequestUrl">, hasPlan: boolean): TicketWorkflowPhase {
  if (ticket.pullRequestUrl) return TICKET_WORKFLOW_PHASE.EXECUTION;
  return hasPlan ? TICKET_WORKFLOW_PHASE.PLANNING : TICKET_WORKFLOW_PHASE.RESEARCH;
}
