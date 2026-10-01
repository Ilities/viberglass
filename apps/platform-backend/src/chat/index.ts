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
import { registerSlackHandlers } from "@viberglass/chat-slack";
import type { SlackHandlerServices } from "@viberglass/chat-slack";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { AgentSessionDAO } from "../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../persistence/agentSession/AgentPendingRequestDAO";
import { resolveSessionAdvance, resolveTicketAdvance } from "../services/agentSession/sessionAdvance";
import { AgentSessionInteractionService } from "../services/agentSession/AgentSessionInteractionService";
import { SessionTurnContinuationService } from "../services/agentSession/SessionTurnContinuationService";
import { AgentSessionQueryService } from "../services/agentSession/AgentSessionQueryService";
import { TaskTurnService } from "../services/taskTurns/TaskTurnService";
import { ACTION_FOR_PHASE } from "../services/taskTurns/turnActions";
import type { AgentSessionMode } from "../types/agentSession";
import { TicketPhaseOrchestrationService } from "../services/TicketPhaseOrchestrationService";
import { isTaskAskPolicyError } from "../services/errors/TaskAskPolicyError";
import { UserDAO } from "../persistence/user/UserDAO";
import { TaskParticipantService } from "../services/tasks/TaskParticipantService";
import { SpaceAccessService } from "../services/spaces/SpaceAccessService";
import { runAsActor } from "../api/auth/requestActor";

// Register as the global singleton so ThreadImpl lazy resolution works.
bot.registerSingleton();

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();

const turnContinuationService = new SessionTurnContinuationService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
);
const taskTurns = new TaskTurnService({ continuation: turnContinuationService });

/** A live session started from Slack is the task's session with that agent, taking the message as its next turn. */
function launchSession(
  params: { ticketId: string; clankerId: string; mode: AgentSessionMode; initialMessage: string },
  actorId: string | null,
) {
  return taskTurns.ask(params.ticketId, actorId, {
    message: params.initialMessage,
    action: ACTION_FOR_PHASE[params.mode],
    agentId: params.clankerId,
  });
}

/** A run of a step, from Slack: the agent's next turn on the task. */
async function runStep(ticketId: string, clankerId: string, mode: AgentSessionMode, message: string, actorId: string | null) {
  const asked = await taskTurns.ask(ticketId, actorId, { message, action: ACTION_FOR_PHASE[mode], agentId: clankerId });
  if (!asked.job.id) throw new Error("The agent's turn has no run yet");
  return { jobId: asked.job.id, status: asked.job.status };
}

const interactionService = new AgentSessionInteractionService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
  turnContinuationService,
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

const ticketPhaseOrchestrationService = new TicketPhaseOrchestrationService(taskTurns);

const userDAO = new UserDAO();
const taskParticipants = new TaskParticipantService();
const spaceAccess = new SpaceAccessService();

/**
 * Acts as the Viberglass person who linked this Slack account, so what they
 * ask the agent for is theirs, under the task's ask policy. Someone who hasn't
 * linked one is told how to, rather than that they need to sign in.
 */
async function asSlackUser<T>(slackUserId: string | undefined, act: (actorId: string | null) => Promise<T>): Promise<T> {
  const actorId = slackUserId ? await userDAO.findActiveIdBySlackUserId(slackUserId) : null;
  try {
    // Runs, Activity and the audit log then credit the person, or say it came from Slack.
    return await runAsActor({ userId: actorId, slackUserId }, () => act(actorId));
  } catch (error) {
    if (!actorId && isTaskAskPolicyError(error)) {
      throw new Error("Link your Slack account in Viberglass (Settings → Notifications) to ask for a build from Slack.");
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

  createTicket: ({ projectId, title, description, slackUserId }) =>
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
        requesterId: requesterId ?? undefined,
      });
    }),

  runJob: async ({ ticketId, clankerId, mode, slackUserId }) => {
    const result = await asSlackUser(slackUserId, (actorId) => runStep(ticketId, clankerId, mode, "", actorId));

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
    asSlackUser(slackUserId, (actorId) => launchSession(params, actorId)),

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
    const result = await asSlackUser(slackUserId, (actorId) => runStep(ticketId, clankerId, mode, revisionMessage, actorId));

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
    const result = await asSlackUser(slackUserId, (actorId) =>
      launchSession({ ticketId, clankerId, mode, initialMessage: "" }, actorId),
    );
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
