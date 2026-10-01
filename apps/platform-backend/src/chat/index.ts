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
import { SessionTurnContinuationService } from "../services/agentSession/SessionTurnContinuationService";
import { AgentSessionQueryService } from "../services/agentSession/AgentSessionQueryService";
import { JobService } from "../services/JobService";
import { CredentialRequirementsService } from "../services/CredentialRequirementsService";
import { TicketResearchService } from "../services/TicketResearchService";
import { TicketPlanningService } from "../services/TicketPlanningService";
import { TicketExecutionService } from "../services/TicketExecutionService";
import { TicketWorkflowService } from "../services/TicketWorkflowService";
import { TicketPlanningApprovalService } from "../services/TicketPlanningApprovalService";
import { TicketPhaseOrchestrationService } from "../services/TicketPhaseOrchestrationService";
import { TicketResearchApprovalService } from "../services/approvals/TicketResearchApprovalService";
import { isApprovalPolicyError } from "../services/errors/ApprovalPolicyError";
import { UserDAO } from "../persistence/user/UserDAO";
import { TaskParticipantService } from "../services/tasks/TaskParticipantService";
import { SpaceAccessService } from "../services/spaces/SpaceAccessService";
import { runAsActor } from "../api/auth/requestActor";
import { getFeedbackService } from "../webhooks/webhookServiceFactory";
import { WorkerExecutionService } from "../workers";
import { JobCancellationService } from "../services/job/JobCancellationService";

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

const turnContinuationService = new SessionTurnContinuationService(
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
  turnContinuationService,
  new JobCancellationService(),
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

let chatFeedbackService;
try {
  chatFeedbackService = getFeedbackService();
} catch (error) {
  logger.warn("Feedback service unavailable for chat phase orchestration", {
    error: error instanceof Error ? error.message : String(error),
  });
}

const ticketPlanningApprovalService = new TicketPlanningApprovalService(
  chatFeedbackService,
);

const ticketPhaseOrchestrationService = new TicketPhaseOrchestrationService(
  ticketDAO,
  ticketWorkflowService,
  ticketPlanningApprovalService,
  new TicketResearchApprovalService(),
  ticketResearchService,
  ticketPlanningService,
  ticketExecutionService,
);

const userDAO = new UserDAO();
const taskParticipants = new TaskParticipantService();
const spaceAccess = new SpaceAccessService();

/**
 * Acts as the Viberglass person who linked this Slack account, so the runs it
 * starts and the approvals it gives are theirs (approvals under the space's
 * policy). Someone who hasn't linked one is told
 * how to, rather than that they need to sign in.
 */
async function asSlackUser<T>(slackUserId: string | undefined, act: (actorId: string | null) => Promise<T>): Promise<T> {
  const actorId = slackUserId ? await userDAO.findActiveIdBySlackUserId(slackUserId) : null;
  try {
    // Runs, Activity and the audit log then credit the person, or say it came from Slack.
    return await runAsActor({ userId: actorId, slackUserId }, () => act(actorId));
  } catch (error) {
    if (!actorId && isApprovalPolicyError(error)) {
      throw new Error("Link your Slack account in Viberglass (Settings → Notifications) to approve from Slack.");
    }
    throw error;
  }
}

ticketJobBridge.configure({
  advanceAndRun: ({ slackUserId, ...params }) =>
    asSlackUser(slackUserId, (actorId) => ticketPhaseOrchestrationService.advanceAndRun({ ...params, actorId })),
});

const slackServices: SlackHandlerServices = {
  listProjects: async (slackUserId) => {
    const userId = await userDAO.findActiveIdBySlackUserId(slackUserId);
    const user = userId ? await userDAO.findById(userId) : null;
    return projectDAO.listProjects(50, 0, user ? await spaceAccess.visibleProjectIds({ id: user.id, role: user.role }) : null);
  },
  listClankers: () => clankerDAO.listClankers(),

  createTicket: ({ projectId, title, description, phase, slackUserId }) =>
    asSlackUser(slackUserId, async (requesterId) => {
      // Only people who can see a space are put on its tasks; the Slack form lists every space.
      if (requesterId) {
        await taskParticipants.assertCanSeeSpace(projectId, requesterId).catch(() => {
          throw new Error("You can't see that space in Viberglass, so you can't ask for something in it.");
        });
      }
      return ticketDAO.createTicket({
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
        requesterId: requesterId ?? undefined,
      });
    }),

  runJob: async ({ ticketId, clankerId, mode, slackUserId }) => {
    const result = await asSlackUser(slackUserId, () =>
      mode === "research"
        ? ticketResearchService.runResearch(ticketId, { clankerId })
        : mode === "planning"
          ? ticketPlanningService.runPlanning(ticketId, { clankerId })
          : ticketExecutionService.runTicket(ticketId, { clankerId }),
    );

    // Start the ticket job bridge to post the document on completion
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(
        result.jobId,
        ticketId,
        thread,
        mode,
        undefined,
        clankerId,
      );
    }

    return result;
  },

  launchSession: ({ slackUserId, ...params }) =>
    asSlackUser(slackUserId, (actorId) => launchService.launch(params, actorId ?? undefined)),

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

  replyToSession: async (sessionId, text, slackUserId) => {
    await asSlackUser(slackUserId, (actorId) => interactionService.reply(sessionId, text, actorId ?? undefined));
  },
  sendMessageToSession: async (sessionId, text, slackUserId) => {
    await asSlackUser(slackUserId, (actorId) => interactionService.sendMessage(sessionId, text, actorId ?? undefined));
  },
  approveSession: async (sessionId, approved, slackUserId) => {
    await asSlackUser(slackUserId, (actorId) => interactionService.approve(sessionId, approved, actorId ?? undefined));
  },

  getSessionForThread,
  linkSessionThread: (sessionId, thread) =>
    linkSessionThread(sessionId, thread, "slack"),
  unlinkSession,
  startBridge: (sessionId, thread, chainTo, chainedBy) =>
    chatSessionBridge.startBridge(sessionId, thread, chainTo, chainedBy),
  approveUpTo: ({ ticketId, targetPhase, slackUserId }) =>
    asSlackUser(slackUserId, (actorId) => ticketPhaseOrchestrationService.approveUpTo(ticketId, targetPhase, actorId)),
  stopBridge: (sessionId: string) => chatSessionBridge.stopBridge(sessionId),

  // Ticket job flow
  resolveTicketAdvance,
  advanceAndRunTicketJob: async ({ ticketId, clankerId, targetPhase, slackUserId }) => {
    const result = await asSlackUser(slackUserId, (actorId) =>
      ticketPhaseOrchestrationService.advanceAndRun({ ticketId, clankerId, targetPhase, actorId }),
    );
    await updateTicketThreadMode(ticketId, targetPhase);

    const mode = targetPhase as "research" | "planning" | "execution";
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(
        result.jobId,
        ticketId,
        thread,
        mode,
        undefined,
        clankerId,
      );
    }

    return result;
  },
  chainAndRunTicketJob: async ({
    ticketId,
    clankerId,
    firstPhase,
    thenPhase,
    slackUserId,
  }) => {
    const result = await asSlackUser(slackUserId, (actorId) =>
      ticketPhaseOrchestrationService.advanceAndRunChain({ ticketId, clankerId, firstPhase, thenPhase, actorId }),
    );
    await updateTicketThreadMode(ticketId, firstPhase);

    const mode = firstPhase as "research" | "planning" | "execution";
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(
        result.jobId,
        ticketId,
        thread,
        mode,
        thenPhase,
        clankerId,
        slackUserId,
      );
    }

    return result;
  },
  runRevisionJob: async ({ ticketId, clankerId, mode, revisionMessage, slackUserId }) => {
    const result = await asSlackUser(slackUserId, () =>
      mode === "research"
        ? ticketResearchService.runResearchRevision(ticketId, { clankerId, revisionMessage })
        : ticketPlanningService.runPlanningRevision(ticketId, { clankerId, revisionMessage }),
    );

    // Start the ticket job bridge to post the revised document on completion
    const thread = await getThreadForTicket(ticketId);
    if (thread) {
      ticketJobBridge.startBridge(
        result.jobId,
        ticketId,
        thread,
        mode,
        undefined,
        clankerId,
      );
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
  launchAndLink: async ({ ticketId, clankerId, mode, thread, slackUserId }) => {
    const result = await asSlackUser(slackUserId, async (actorId) => {
      await ticketPhaseOrchestrationService.approveUpTo(ticketId, mode, actorId);
      return launchService.launch({ ticketId, clankerId, mode, initialMessage: "" }, actorId ?? undefined);
    });
    await linkSessionThread(result.session.id, thread, "slack");
    return result.session.id;
  },
});

registerSlackHandlers(bot, slackServices);

/**
 * Resume bridges for active sessions and ticket jobs that were running before
 * a restart. Call it once the database is migrated: the bridges read tables
 * that don't exist on a fresh database until then.
 */
export async function resumeChatBridges(): Promise<void> {
  await Promise.all([
    chatSessionBridge.resumeActiveBridges(),
    ticketJobBridge.resumeActiveBridges(),
  ]);
}

export default bot;
