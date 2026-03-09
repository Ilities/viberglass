import type { TicketWorkflowPhase } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import {
  type PhaseDocumentRevision,
  type PhaseDocumentRevisionSource,
  TicketPhaseDocumentRevisionDAO,
} from "../persistence/ticketing/TicketPhaseDocumentRevisionDAO";

export interface PhaseDocumentRevisionView {
  id: string;
  documentId: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  source: PhaseDocumentRevisionSource;
  actor: string | null;
  createdAt: string;
}

export class TicketPhaseDocumentRevisionService {
  private readonly ticketDAO = new TicketDAO();
  private readonly revisionDAO = new TicketPhaseDocumentRevisionDAO();

  async listRevisions(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocumentRevisionView[]> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const revisions = await this.revisionDAO.listByTicketAndPhase(ticketId, phase);
    return revisions.map((revision) => this.toView(revision));
  }

  private toView(revision: PhaseDocumentRevision): PhaseDocumentRevisionView {
    return {
      id: revision.id,
      documentId: revision.documentId,
      ticketId: revision.ticketId,
      phase: revision.phase,
      content: revision.content,
      source: revision.source,
      actor: revision.actor,
      createdAt: revision.createdAt.toISOString(),
    };
  }
}
