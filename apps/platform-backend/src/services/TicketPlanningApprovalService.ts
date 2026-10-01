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
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";
import { TaskActivityRecorder } from "./tasks/TaskActivityRecorder";
import { ApprovalPolicyService } from "./approvals/ApprovalPolicyService";

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
  private readonly activity = new TaskActivityRecorder();

  constructor(
    private readonly feedbackService?: FeedbackService,
    private readonly policy: Pick<ApprovalPolicyService, "assertCanApprove"> = new ApprovalPolicyService(),
  ) {}

  /** Approves the plan as this person, if the space's policy lets them, and moves the task on to the build. */
  async approve(ticketId: string, actorId: string | null): Promise<PlanningPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.PLANNING) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.PLANNING_RUN_INVALID_PHASE,
        "Approval can only be granted during the planning phase",
      );
    }
    await this.policy.assertCanApprove(actorId, ticketId, "planning");
    const document = await this.documentService.approveDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      actorId,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      "approved",
      actorId,
      "Planning document approved",
    );
    await this.activity.record(ticketId, { type: "human", userId: actorId }, "document_approved", { step: "planning" });

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

  /** Taking an approval back is the same decision as giving it, so the same people may. */
  async revokeApproval(
    ticketId: string,
    actorId: string | null,
  ): Promise<PlanningPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    await this.policy.assertCanApprove(actorId, ticketId, "planning");

    const document = await this.documentService.revokeApproval(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
      "revoked",
      actorId,
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
