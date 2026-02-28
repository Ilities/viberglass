import {
  TICKET_WORKFLOW_PHASE,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";

export interface TicketWorkflowPhaseState {
  phase: TicketWorkflowPhase;
  status: "completed" | "current" | "upcoming";
}

export interface TicketWorkflowView {
  ticketId: string;
  workflowPhase: TicketWorkflowPhase;
  phases: TicketWorkflowPhaseState[];
}

export class TicketWorkflowService {
  private readonly ticketDAO = new TicketDAO();

  async getTicketWorkflow(ticketId: string): Promise<TicketWorkflowView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    return {
      ticketId: ticket.id,
      workflowPhase: ticket.workflowPhase,
      phases: this.buildPhases(ticket.workflowPhase),
    };
  }

  async advancePhase(
    ticketId: string,
    targetPhase: TicketWorkflowPhase,
  ): Promise<{ ticketId: string; workflowPhase: TicketWorkflowPhase }> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    if (!this.canAdvance(ticket.workflowPhase, targetPhase)) {
      throw new Error(
        `Cannot advance ticket workflow from ${ticket.workflowPhase} to ${targetPhase}`,
      );
    }

    await this.ticketDAO.updateWorkflowPhase(ticketId, targetPhase);

    return {
      ticketId,
      workflowPhase: targetPhase,
    };
  }

  private buildPhases(
    currentPhase: TicketWorkflowPhase,
  ): TicketWorkflowPhaseState[] {
    const orderedPhases: TicketWorkflowPhase[] = [
      TICKET_WORKFLOW_PHASE.RESEARCH,
      TICKET_WORKFLOW_PHASE.PLANNING,
      TICKET_WORKFLOW_PHASE.EXECUTION,
    ];
    const currentIndex = orderedPhases.indexOf(currentPhase);

    return orderedPhases.map((phase, index) => ({
      phase,
      status:
        index < currentIndex
          ? "completed"
          : index === currentIndex
            ? "current"
            : "upcoming",
    }));
  }

  private canAdvance(
    currentPhase: TicketWorkflowPhase,
    targetPhase: TicketWorkflowPhase,
  ): boolean {
    return (
      (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH &&
        targetPhase === TICKET_WORKFLOW_PHASE.PLANNING) ||
      (currentPhase === TICKET_WORKFLOW_PHASE.PLANNING &&
        targetPhase === TICKET_WORKFLOW_PHASE.EXECUTION)
    );
  }
}
