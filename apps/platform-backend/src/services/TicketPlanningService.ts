import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import {
  type PhaseDocumentView,
  TicketPhaseDocumentService,
} from "./TicketPhaseDocumentService";

export interface PlanningRunView {
  id: string;
  jobId: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  clankerId: string;
  clankerName: string | null;
  clankerSlug: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PlanningPhaseView {
  document: PhaseDocumentView;
  latestRun: PlanningRunView | null;
}

/** The step's document and its last run. Agents are asked to write it through TaskTurnService. */
export class TicketPlanningService {
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly phaseRunDAO = new TicketPhaseRunDAO();

  async getPlanningPhase(ticketId: string): Promise<PlanningPhaseView> {
    const document = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    const latestRun = await this.phaseRunDAO.getLatestRun(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    return {
      document,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            jobId: latestRun.jobId,
            status: latestRun.status,
            clankerId: latestRun.clankerId,
            clankerName: latestRun.clankerName,
            clankerSlug: latestRun.clankerSlug,
            createdAt: latestRun.createdAt.toISOString(),
            startedAt: latestRun.startedAt?.toISOString() || null,
            finishedAt: latestRun.finishedAt?.toISOString() || null,
          }
        : null,
    };
  }
}
