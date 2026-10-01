import express from "express";
import logger from "../../config/logger";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { FileUploadService } from "../../services/FileUploadService";
import { TicketExecutionService } from "../../services/TicketExecutionService";
import { createBuildPullRequestService } from "../../services/pull-request-reviews/createBuildPullRequestService";
import { TicketPhaseDocumentCommentService } from "../../services/TicketPhaseDocumentCommentService";
import { TicketPhaseDocumentRevisionService } from "../../services/TicketPhaseDocumentRevisionService";
import { TicketPhaseDocumentService } from "../../services/TicketPhaseDocumentService";
import { TicketPlanningApprovalService } from "../../services/TicketPlanningApprovalService";
import { TicketPlanningService } from "../../services/TicketPlanningService";
import { TicketResearchService } from "../../services/TicketResearchService";
import { TicketWorkflowOverrideService } from "../../services/TicketWorkflowOverrideService";
import { TicketWorkflowService } from "../../services/TicketWorkflowService";
import { getFeedbackService } from "../../webhooks/webhookServiceFactory";
import type { FeedbackService } from "../../webhooks/FeedbackService";
import { requireAuth } from "../middleware/authentication";
import { validateUuidParam } from "../middleware/validation";
import { TICKET_STATUS, type TicketLifecycleStatus } from "@viberglass/types";
import { registerTicketCrudMediaRoutes } from "./tickets/crudMediaRoutes";
import { registerTicketExecutionRoutes } from "./tickets/executionRoutes";
import { registerTicketReopenRoutes } from "./tickets/reopenRoutes";
import { TicketStepReopenService } from "../../services/TicketStepReopenService";
import { TicketPhaseApprovalDAO } from "../../persistence/ticketing/TicketPhaseApprovalDAO";
import { TicketPhaseRunGuard } from "../../services/TicketPhaseRunGuard";
import { registerTicketWorkflowPhaseRoutes } from "./tickets/workflowPhaseRoutes";
import { registerTicketAgentSessionRoutes } from "./tickets/agentSessionRoutes";
import { AgentSessionLaunchService } from "../../services/agentSession/AgentSessionLaunchService";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import { IntegrationDAO } from "../../persistence/integrations";
import { taskKeyParamGuard, taskParamGuard } from "../middleware/spaceAccessGuards";
import { TaskParticipantService } from "../../services/tasks/TaskParticipantService";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { registerTaskParticipantRoutes } from "./tickets/participantRoutes";
import { registerTaskApprovalRoutes } from "./tickets/approvalRoutes";
import { ApprovalPolicyService } from "../../services/approvals/ApprovalPolicyService";
import { StepApprovalRequestService } from "../../services/approvals/StepApprovalRequestService";
import { TicketResearchApprovalService } from "../../services/approvals/TicketResearchApprovalService";
import { registerTaskDiscussionRoutes } from "./tickets/discussionRoutes";
import { TaskDiscussionService } from "../../services/tasks/TaskDiscussionService";
import { TaskActivityDAO } from "../../persistence/ticketing/TaskActivityDAO";
import { TaskActivityRecorder } from "../../services/tasks/TaskActivityRecorder";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();
const buildPullRequestService = createBuildPullRequestService();
const ticketExecutionService = new TicketExecutionService(buildPullRequestService);
const ticketWorkflowService = new TicketWorkflowService();
const ticketPhaseDocumentService = new TicketPhaseDocumentService();
const ticketPhaseDocumentRevisionService =
  new TicketPhaseDocumentRevisionService();
const ticketPhaseDocumentCommentService =
  new TicketPhaseDocumentCommentService();

let feedbackService: FeedbackService | undefined;
try {
  feedbackService = getFeedbackService();
} catch (error) {
  logger.warn("Feedback service unavailable for ticket phase approvals", {
    error: error instanceof Error ? error.message : String(error),
  });
}

const ticketResearchService = new TicketResearchService();
const ticketPlanningService = new TicketPlanningService();
const ticketPlanningApprovalService = new TicketPlanningApprovalService(
  feedbackService,
);
const ticketWorkflowOverrideService = new TicketWorkflowOverrideService();

router.use(requireAuth);
router.param("id", taskParamGuard());
router.param("key", taskKeyParamGuard());

const taskParticipants = new TaskParticipantService();
const taskActivity = new TaskActivityRecorder();
registerTaskParticipantRoutes(router, taskParticipants);
registerTaskDiscussionRoutes(router, { discussion: new TaskDiscussionService(), activity: new TaskActivityDAO() });

// GET /api/tasks/by-key/:key - A task by its key (WEB-42), for links that show the key.
router.get("/by-key/:key", async (req, res, next) => {
  try {
    const id = await ticketService.findIdByKey(req.params.key);
    const ticket = id ? await ticketService.getTicket(id) : null;
    if (!ticket) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

const validSetStatuses: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.IN_REVIEW,
  TICKET_STATUS.RESOLVED,
];

router.post("/:id/set-status", validateUuidParam("id"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: unknown };

  if (!status || !validSetStatuses.includes(status as TicketLifecycleStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    if (status === TICKET_STATUS.IN_REVIEW) {
      const ticket = await ticketService.getTicket(id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      await ticketPhaseDocumentService.requestApproval(id, ticket.workflowPhase);
    } else {
      const before = await ticketService.getTicket(id);
      await ticketService.updateTicket(id, {
        status: status as TicketLifecycleStatus,
      });
      if (before && before.status !== TICKET_STATUS.RESOLVED && status === TICKET_STATUS.RESOLVED) {
        await taskActivity.recordByCurrentActor(id, "task_done");
      }
    }

    const updated = await ticketService.getTicket(id);
    if (!updated) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    logger.error("Error setting ticket status", {
      ticketId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: "Internal server error" });
  }
});

registerTicketCrudMediaRoutes(router, {
  ticketService,
  projectService,
  fileUploadService,
  integrationDAO: new IntegrationDAO(),
  agentSessionDAO: new AgentSessionDAO(),
  spaceAccess: new SpaceAccessService(),
  participants: taskParticipants,
  participantDAO: new TaskParticipantDAO(),
  activity: taskActivity,
});

registerTicketWorkflowPhaseRoutes(router, {
  ticketWorkflowService,
  ticketPhaseDocumentService,
  ticketPhaseDocumentRevisionService,
  ticketPhaseDocumentCommentService,
  ticketResearchService,
  ticketPlanningService,
});

registerTaskApprovalRoutes(router, {
  policy: new ApprovalPolicyService(),
  requests: new StepApprovalRequestService({ participants: taskParticipants }),
  research: new TicketResearchApprovalService({ workflow: ticketWorkflowService, documents: ticketPhaseDocumentService }),
  planning: ticketPlanningApprovalService,
});

registerTicketExecutionRoutes(router, {
  ticketExecutionService,
  ticketWorkflowOverrideService,
  ticketDAO: ticketService,
  buildPullRequestService,
});

registerTicketReopenRoutes(router, {
  ticketStepReopenService: new TicketStepReopenService(
    ticketService,
    ticketWorkflowService,
    ticketPhaseDocumentService,
    new TicketPhaseApprovalDAO(),
    new TicketPhaseRunGuard(),
  ),
});

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();

const agentSessionLaunchService = new AgentSessionLaunchService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

const agentSessionQueryService = new AgentSessionQueryService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
);

registerTicketAgentSessionRoutes(router, {
  launchService: agentSessionLaunchService,
  queryService: agentSessionQueryService,
});

export default router;
