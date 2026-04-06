/**
 * Chat SDK initialization — registers all chat adapter handlers.
 * Import this module once from app.ts to activate chat integrations.
 */
import bot from "./bot";
import { chatSessionBridge } from "./ChatSessionBridgeService";
import { ticketJobBridge } from "./TicketJobBridge";
import {
  linkSessionThread,
  unlinkSession,
  getSessionForThread,
} from "./sessionThreadMap";
import {
  linkTicketThread,
  getTicketForThread,
  getThreadForTicket,
  updateTicketThreadMode,
} from "./ticketThreadMap";
import { ticketUrl } from "./platformLinks";
import logger from "../config/logger";
import { registerSlackHandlers } from "@viberglass/chat-slack";
import type { SlackHandlerServices } from "@viberglass/chat-slack";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { AgentSessionDAO } from "../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionLaunchService } from "../services/agentSession/AgentSessionLaunchService";
import { resolveSessionAdvance, resolveTicketAdvance } from "../services/agentSession/sessionAdvance";
import { AgentSessionInteractionService } from "../services/agentSession/AgentSessionInteractionService";
import { AgentSessionQueryService } from "../services/agentSession/AgentSessionQueryService";
import { JobService } from "../services/JobService";
import { CredentialRequirementsService } from "../services/CredentialRequirementsService";
import { TicketResearchService } from "../services/TicketResearchService";
import { TicketPlanningService } from "../services/TicketPlanningService";
import { TicketExecutionService } from "../services/TicketExecutionService";
import { TicketWorkflowService } from "../services/TicketWorkflowService";
import { WorkerExecutionService } from "../workers";

// Register as the global singleton so ThreadImpl lazy resolution works.
bot.registerSingleton();

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();
const jobService = new JobService();
const credentialService = new CredentialRequirementsService();
const workerService = new WorkerExecutionService();

const launchService = new AgentSessionLaunchService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  jobService,
  credentialService,
  workerService,
);

const interactionService = new AgentSessionInteractionService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
  jobService,
  credentialService,
  workerService,
);

const queryService = new AgentSessionQueryService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
);

const ticketDAO = new TicketDAO();
const projectDAO = new ProjectDAO();
const clankerDAO = new ClankerDAO();
const ticketResearchService = new TicketResearchService();
const ticketPlanningService = new TicketPlanningService();
const ticketExecutionService = new TicketExecutionService();
const ticketWorkflowService = new TicketWorkflowService();

const slackServices: SlackHandlerServices = {
  listProjects: () => projectDAO.listProjects(),
  listClankers: () => clankerDAO.listClankers(),

  createTicket: ({ projectId, title, description, phase }) =>
    ticketDAO.createTicket({
      projectId,
      title,
      description,
      severity: "medium",
      category: "slack",
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
      ticketSystem: "slack",
      workflowPhase: phase,
    }),

  runJob: async ({ ticketId, clankerId, mode }) => {
    let result;
    if (mode === "research") {
      result = await ticketResearchService.runResearch(ticketId, { clankerId });
    } else if (mode === "planning") {
      result = await ticketPlanningService.runPlanning(ticketId, { clankerId });
    } else {
      result = await ticketExecutionService.runTicket(ticketId, { clankerId });
    }

    // Start the ticket job bridge to post the document on completion
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(result.jobId, ticketId, thread, mode);
    }

    return result;
  },

  launchSession: (params) => launchService.launch(params),

  getSessionDetail: async (sessionId) => {
    const detail = await queryService.getDetail(sessionId);
    return detail
      ? {
          session: {
            status: detail.session.status,
            mode: detail.session.mode,
            ticketId: detail.session.ticketId,
            clankerId: detail.session.clankerId,
          },
        }
      : null;
  },

  replyToSession: async (sessionId, text) => {
    await interactionService.reply(sessionId, text);
  },
  sendMessageToSession: async (sessionId, text) => {
    await interactionService.sendMessage(sessionId, text);
  },
  approveSession: async (sessionId, approved) => {
    await interactionService.approve(sessionId, approved);
  },

  getSessionForThread,
  linkSessionThread: (sessionId, thread) =>
    linkSessionThread(sessionId, thread, "slack"),
  unlinkSession,
  startBridge: (sessionId, thread, chainTo) =>
    chatSessionBridge.startBridge(sessionId, thread, chainTo),
  stopBridge: (sessionId: string) => chatSessionBridge.stopBridge(sessionId),

  // Ticket job flow
  resolveTicketAdvance,
  advanceAndRunTicketJob: async ({ ticketId, clankerId, targetPhase }) => {
    await ticketWorkflowService.advancePhase(ticketId, targetPhase);
    await updateTicketThreadMode(ticketId, targetPhase);

    const mode = targetPhase as "research" | "planning" | "execution";
    let result;
    if (mode === "research") {
      result = await ticketResearchService.runResearch(ticketId, { clankerId });
    } else if (mode === "planning") {
      result = await ticketPlanningService.runPlanning(ticketId, { clankerId });
    } else {
      result = await ticketExecutionService.runTicket(ticketId, { clankerId });
    }

    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(result.jobId, ticketId, thread, mode);
    }

    return result;
  },
  runRevisionJob: async ({ ticketId, clankerId, mode, revisionMessage }) => {
    let result;
    if (mode === "research") {
      result = await ticketResearchService.runResearchRevision(ticketId, {
        clankerId,
        revisionMessage,
      });
    } else {
      result = await ticketPlanningService.runPlanningRevision(ticketId, {
        clankerId,
        revisionMessage,
      });
    }

    // Start the ticket job bridge to post the revised document on completion
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(result.jobId, ticketId, thread, mode);
    }

    return result;
  },
  linkTicketThread: (ticketId, thread, clankerId, mode) =>
    linkTicketThread(ticketId, thread, clankerId, mode),
  getTicketForThread: (threadId) => getTicketForThread(threadId),

  ticketUrl,

  getProject: async (id: string) => {
    const project = await projectDAO.getProject(id);
    return project ? { id: project.id, slug: project.slug } : null;
  },

  resolveSessionAdvance,
};

chatSessionBridge.configure({
  approveSession: async (sessionId) => {
    await interactionService.approve(sessionId, true);
  },
  launchAndLink: async ({ ticketId, clankerId, mode, thread }) => {
    const result = await launchService.launch({
      ticketId,
      clankerId,
      mode,
      initialMessage: "",
    });
    await linkSessionThread(result.session.id, thread, "slack");
    return result.session.id;
  },
});

registerSlackHandlers(bot, slackServices);

// Resume bridges for active sessions and ticket jobs that were running before restart.
// Deferred so it doesn't block module loading.
setTimeout(() => {
  chatSessionBridge.resumeActiveBridges().catch((err) => {
    logger.error("Failed to resume active chat bridges", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  ticketJobBridge.resumeActiveBridges().catch((err) => {
    logger.error("Failed to resume ticket job bridges", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}, 0);

export default bot;
