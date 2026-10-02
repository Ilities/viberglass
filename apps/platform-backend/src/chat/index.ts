/**
 * Chat SDK initialization — registers all chat adapter handlers.
 * Import this module once from app.ts to activate chat integrations.
 */
import bot from "./bot";
import { getTicketForThread, linkTicketThread } from "./ticketThreadMap";
import { ticketUrl } from "./platformLinks";
import { TaskSlackMirror } from "./TaskSlackMirror";
import { TaskThreadInbound } from "./TaskThreadInbound";
import { registerSlackHandlers } from "@viberglass/chat-slack";
import type { SlackHandlerServices } from "@viberglass/chat-slack";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { UserDAO } from "../persistence/user/UserDAO";
import { TaskTurnService } from "../services/taskTurns/TaskTurnService";
import { AgentQuestionAnswerService } from "../services/questions/AgentQuestionAnswerService";
import { TaskParticipantService } from "../services/tasks/TaskParticipantService";
import { SpaceAccessService } from "../services/spaces/SpaceAccessService";
import { registerActivityListener } from "../services/tasks/activityListeners";
import { runAsActor } from "../api/auth/requestActor";

// Register as the global singleton so ThreadImpl lazy resolution works.
bot.registerSingleton();

const taskTurns = new TaskTurnService();
const inbound = new TaskThreadInbound({ turns: taskTurns, answers: new AgentQuestionAnswerService({ asker: taskTurns }) });

const ticketDAO = new TicketDAO();
const projectDAO = new ProjectDAO();
const clankerDAO = new ClankerDAO();
const userDAO = new UserDAO();
const taskParticipants = new TaskParticipantService();
const spaceAccess = new SpaceAccessService();

// Every task with a Slack thread has its thread mirrored there, whatever made the change.
registerActivityListener(new TaskSlackMirror());

const slackServices: SlackHandlerServices = {
  listProjects: async (slackUserId) => {
    const userId = await userDAO.findActiveIdBySlackUserId(slackUserId);
    const user = userId ? await userDAO.findById(userId) : null;
    return projectDAO.listProjects(50, 0, user ? await spaceAccess.visibleProjectIds({ id: user.id, role: user.role }) : null);
  },
  listClankers: () => clankerDAO.listClankers(),

  createTicket: async ({ projectId, title, description, slackUserId }) => {
    const requesterId = await userDAO.findActiveIdBySlackUserId(slackUserId);
    return runAsActor({ userId: requesterId, slackUserId }, async () => {
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
    });
  },
  getProject: async (id: string) => {
    const project = await projectDAO.getProject(id);
    return project ? { id: project.id, slug: project.slug } : null;
  },
  ticketUrl,

  linkTaskThread: (ticketId, thread) => linkTicketThread(ticketId, thread, "slack"),
  getTaskForThread: getTicketForThread,

  receiveThreadMessage: (params) => inbound.receive(params),
  askAgent: (params) => inbound.ask(params),
  answerQuestion: (params) => inbound.answer(params),
};

registerSlackHandlers(bot, slackServices);

export default bot;
