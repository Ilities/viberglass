import express from "express";
import logger from "../../config/logger";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TicketListDAO } from "../../persistence/ticketing/TicketListDAO";
import { FileUploadService } from "../../services/FileUploadService";
import { createBuildPullRequestService } from "../../services/pull-request-reviews/createBuildPullRequestService";
import { TicketPhaseDocumentCommentService } from "../../services/TicketPhaseDocumentCommentService";
import { TicketPhaseDocumentRevisionService } from "../../services/TicketPhaseDocumentRevisionService";
import { TicketPhaseDocumentService } from "../../services/TicketPhaseDocumentService";
import { TicketPlanningService } from "../../services/TicketPlanningService";
import { TicketResearchService } from "../../services/TicketResearchService";
import { TicketWorkflowService } from "../../services/TicketWorkflowService";
import { requireAuth } from "../middleware/authentication";
import { validateUuidParam } from "../middleware/validation";
import { TICKET_STATUS, type TicketLifecycleStatus } from "@viberglass/types";
import { registerTicketCrudRoutes } from "./tickets/crudRoutes";
import { registerTicketExecutionRoutes } from "./tickets/executionRoutes";
import { registerTicketWorkflowPhaseRoutes } from "./tickets/workflowPhaseRoutes";
import { registerDocumentCommentRoutes } from "./tickets/documentCommentRoutes";
import { registerTicketAgentSessionRoutes } from "./tickets/agentSessionRoutes";
import { TaskTurnAgentResolver } from "../../services/taskTurns/TaskTurnAgentResolver";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { IntegrationDAO } from "../../persistence/integrations";
import { taskKeyParamGuard, taskParamGuard } from "../middleware/spaceAccessGuards";
import { TaskParticipantService } from "../../services/tasks/TaskParticipantService";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { registerTaskParticipantRoutes } from "./tickets/participantRoutes";
import { registerTaskReadRoutes } from "./tickets/taskReadRoutes";
import { registerTaskMediaRoutes } from "./tickets/taskMediaRoutes";
import { TaskSituationService } from "../../services/tasks/TaskSituationService";
import { TaskReadDAO } from "../../persistence/ticketing/TaskReadDAO";
import { TaskAskPolicyService } from "../../services/taskTurns/TaskAskPolicyService";
import { registerTaskDiscussionRoutes } from "./tickets/discussionRoutes";
import { TaskMentionDAO } from "../../persistence/ticketing/TaskMentionDAO";
import { registerTaskQuestionRoutes } from "./tickets/questionRoutes";
import { registerTaskSteeringRoutes } from "./tickets/steeringRoutes";
import { TaskSteeringService } from "../../services/taskTurns/TaskSteeringService";
import { TaskTakeoverService } from "../../services/tasks/TaskTakeoverService";
import { TaskCodeBranchService } from "../../services/tasks/TaskCodeBranchService";
import { PausedRunRetryService } from "../../services/taskTurns/PausedRunRetryService";
import { AgentQuestionAnswerService } from "../../services/questions/AgentQuestionAnswerService";
import { TaskDiscussionService } from "../../services/tasks/TaskDiscussionService";
import { TaskTimelineService } from "../../services/tasks/TaskTimelineService";
import { TaskTurnService } from "../../services/taskTurns/TaskTurnService";
import { TaskActivityRecorder } from "../../services/tasks/TaskActivityRecorder";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { taskChangeGuard } from "../middleware/taskChangeGuards";
import { TaskChangePolicyService } from "../../services/tasks/TaskChangePolicyService";

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();
const buildPullRequestService = createBuildPullRequestService();
const ticketWorkflowService = new TicketWorkflowService();
const ticketPhaseDocumentService = new TicketPhaseDocumentService();
const ticketPhaseDocumentRevisionService =
  new TicketPhaseDocumentRevisionService();
const ticketPhaseDocumentCommentService =
  new TicketPhaseDocumentCommentService();

const ticketResearchService = new TicketResearchService();
const ticketPlanningService = new TicketPlanningService();

router.use(requireAuth);
router.param("id", taskParamGuard());
router.param("key", taskKeyParamGuard());

const taskParticipants = new TaskParticipantService();
const taskActivity = new TaskActivityRecorder();
const taskDiscussion = new TaskDiscussionService();
const taskTurns = new TaskTurnService({ discussion: taskDiscussion });
registerTaskParticipantRoutes(router, taskParticipants);
registerTaskDiscussionRoutes(router, {
  discussion: taskDiscussion,
  timeline: new TaskTimelineService(),
  turns: taskTurns,
  mentions: new TaskMentionDAO(),
});
registerTaskQuestionRoutes(router, { answers: new AgentQuestionAnswerService({ asker: taskTurns }) });
const steering = new TaskSteeringService({ turns: taskTurns });
registerTaskSteeringRoutes(router, {
  steering,
  pausedRuns: new PausedRunRetryService({ steering }),
  takeover: new TaskTakeoverService({ turns: taskTurns }),
  branches: new TaskCodeBranchService(),
});

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

router.post("/:id/set-status", validateUuidParam("id"), taskChangeGuard("edit"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: unknown };

  if (!status || !validSetStatuses.includes(status as TicketLifecycleStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const before = await ticketService.getTicket(id);
    await ticketService.updateTicket(id, {
      status: status as TicketLifecycleStatus,
    });
    if (before && before.status !== TICKET_STATUS.RESOLVED && status === TICKET_STATUS.RESOLVED) {
      await taskActivity.recordByCurrentActor(id, "task_done");
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

const spaceAccess = new SpaceAccessService();
const ticketLists = new TicketListDAO();
registerTicketCrudRoutes(router, {
  ticketService,
  ticketLists,
  projectService,
  fileUploadService,
  integrationDAO: new IntegrationDAO(),
  spaceAccess,
  participants: taskParticipants,
  activity: taskActivity,
});
registerTaskMediaRoutes(router, { ticketService, fileUploadService });
registerTaskReadRoutes(router, {
  ticketService,
  ticketLists,
  agentSessionDAO: new AgentSessionDAO(),
  spaceAccess,
  participantDAO: new TaskParticipantDAO(),
  situations: new TaskSituationService(),
  policy: new TaskAskPolicyService(),
  changes: new TaskChangePolicyService(),
  reads: new TaskReadDAO(),
});

registerTicketWorkflowPhaseRoutes(router, {
  ticketWorkflowService,
  ticketPhaseDocumentService,
  ticketPhaseDocumentRevisionService,
  ticketResearchService,
  ticketPlanningService,
});
registerDocumentCommentRoutes(router, { ticketPhaseDocumentCommentService });


registerTicketExecutionRoutes(router, {
  ticketDAO: ticketService,
  buildPullRequestService,
});

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();

const agentSessionQueryService = new AgentSessionQueryService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
);

registerTicketAgentSessionRoutes(router, {
  turns: taskTurns,
  queryService: agentSessionQueryService,
  agents: new TaskTurnAgentResolver(),
});

export default router;
