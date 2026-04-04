import express from "express";
import logger from "../../config/logger";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { FileUploadService } from "../../services/FileUploadService";
import { TicketExecutionService } from "../../services/TicketExecutionService";
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
import { registerTicketCrudMediaRoutes } from "./tickets/crudMediaRoutes";
import { registerTicketExecutionRoutes } from "./tickets/executionRoutes";
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

const router = express.Router();
const ticketService = new TicketDAO();
const projectService = new ProjectDAO();
const fileUploadService = new FileUploadService();
const ticketExecutionService = new TicketExecutionService();
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

registerTicketCrudMediaRoutes(router, {
  ticketService,
  projectService,
  fileUploadService,
});

registerTicketWorkflowPhaseRoutes(router, {
  ticketWorkflowService,
  ticketPhaseDocumentService,
  ticketPhaseDocumentRevisionService,
  ticketPhaseDocumentCommentService,
  ticketResearchService,
  ticketPlanningService,
  ticketPlanningApprovalService,
});

registerTicketExecutionRoutes(router, {
  ticketExecutionService,
  ticketWorkflowOverrideService,
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
