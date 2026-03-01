import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import logger from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseApprovalDAO } from "../persistence/ticketing/TicketPhaseApprovalDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import {
  TicketPhaseDocumentService,
  type PhaseDocumentView,
} from "./TicketPhaseDocumentService";
import { TicketWorkflowService } from "./TicketWorkflowService";
import type { FeedbackService } from "../webhooks/FeedbackService";
import type {
  PlanningPhaseView,
  PlanningRunView,
} from "./TicketPlanningService";

function toPlanningRunView(
  latestRun: Awaited<ReturnType<TicketPhaseRunDAO["getLatestRun"]>>,
): PlanningRunView | null {
  if (!latestRun) {
    return null;
  }

  return {
    id: latestRun.id,
    jobId: latestRun.jobId,
    status: latestRun.status,
    clankerId: latestRun.clankerId,
    clankerName: latestRun.clankerName,
    clankerSlug: latestRun.clankerSlug,
    createdAt: latestRun.createdAt.toISOString(),
    startedAt: latestRun.startedAt?.toISOString() || null,
    finishedAt: latestRun.finishedAt?.toISOString() || null,
  };
}

export class TicketPlanningApprovalService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly approvalDAO = new TicketPhaseApprovalDAO();
  private readonly workflowService = new TicketWorkflowService();
  private readonly phaseRunDAO = new TicketPhaseRunDAO();

  constructor(private readonly feedbackService?: FeedbackService) {}

  async requestApproval(
    ticketId: string,
    actor?: string,
  ): Promise<PlanningPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const document = await this.documentService.requestApproval(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      "approval_requested",
      actor,
    );

    return this.buildPhaseView(ticketId, document);
  }

  async approve(ticketId: string, actor?: string): Promise<PlanningPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const document = await this.documentService.approveDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      "approved",
      actor,
      "Planning document approved",
    );

    await this.workflowService.advancePhase(
      ticketId,
      TICKET_WORKFLOW_PHASE.EXECUTION,
    );

    if (this.feedbackService) {
      this.feedbackService
        .postPlanningApproved({
          id: ticketId,
          ticketId,
          workflowPhase: TICKET_WORKFLOW_PHASE.PLANNING,
        })
        .catch((error) => {
          logger.error(
            `Failed to post planning approval event for ticket ${ticketId}`,
            {
              error: error instanceof Error ? error.message : String(error),
              ticketId,
            },
          );
        });
    }

    return this.buildPhaseView(ticketId, document);
  }

  async revokeApproval(
    ticketId: string,
    actor?: string,
  ): Promise<PlanningPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const document = await this.documentService.revokeApproval(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      "revoked",
      actor,
      "Planning approval revoked",
    );

    return this.buildPhaseView(ticketId, document);
  }

  private async buildPhaseView(
    ticketId: string,
    document: PhaseDocumentView,
  ): Promise<PlanningPhaseView> {
    const latestRun = await this.phaseRunDAO.getLatestRun(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    return {
      document,
      latestRun: toPlanningRunView(latestRun),
    };
  }
}
