/**
 * Chat: the bot with each chat service's handlers, rebuilt when a chat
 * service's connection changes. Import this module once from app.ts.
 */
import type { ChatHandlerServices } from "@viberglass/integration-core";
import { Chat } from "chat";
import { createPostgresState } from "@chat-adapter/state-pg";
import { pool } from "../persistence/config/database";
import { integrationRegistry } from "../integrations/registerIntegrationPlugins";
import { registerConnectionChangeListener } from "../api/services/integrations/connectionChangeListeners";
import { ChatBotRuntime } from "./ChatBotRuntime";
import { ChatBotStatusReader } from "./ChatBotStatusReader";
import { ChatConnections } from "./ChatConnections";
import { chatServicesFrom, type ChatService } from "./chatProviders";
import { forgetCachedThreads, getTicketForThread, linkTicketThread } from "./ticketThreadMap";
import { ticketUrl } from "./platformLinks";
import { TaskChatMirror } from "./TaskChatMirror";
import { TaskThreadInbound } from "./TaskThreadInbound";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { UserDAO } from "../persistence/user/UserDAO";
import { ChatIdentityDAO } from "../persistence/user/ChatIdentityDAO";
import { TaskTurnService } from "../services/taskTurns/TaskTurnService";
import { AgentQuestionAnswerService } from "../services/questions/AgentQuestionAnswerService";
import { TaskParticipantService } from "../services/tasks/TaskParticipantService";
import { SpaceAccessService } from "../services/spaces/SpaceAccessService";
import { registerActivityListener } from "../services/tasks/activityListeners";
import { runAsActor } from "../api/auth/requestActor";

const taskTurns = new TaskTurnService();
const answers = new AgentQuestionAnswerService({ asker: taskTurns });

const ticketDAO = new TicketDAO();
const projectDAO = new ProjectDAO();
const clankerDAO = new ClankerDAO();
const userDAO = new UserDAO();
const identities = new ChatIdentityDAO();
const taskParticipants = new TaskParticipantService();
const spaceAccess = new SpaceAccessService();

// Every task with a chat thread has its thread mirrored there, whatever made the change.
registerActivityListener(new TaskChatMirror());

function handlerServices({ system, label, provider }: ChatService): ChatHandlerServices {
  const { adapterName } = provider;
  const inbound = new TaskThreadInbound({ label, provider }, { turns: taskTurns, answers });
  return {
    listProjects: async (chatUserId) => {
      const userId = await identities.findActiveUserId(adapterName, chatUserId);
      const user = userId ? await userDAO.findById(userId) : null;
      return projectDAO.listProjects(50, 0, user ? await spaceAccess.visibleProjectIds({ id: user.id, role: user.role }) : null);
    },
    listClankers: () => clankerDAO.listClankers(),

    createTicket: async ({ projectId, title, description, chatUserId }) => {
      const requesterId = await identities.findActiveUserId(adapterName, chatUserId);
      return runAsActor({ userId: requesterId, chat: { adapterName, chatUserId } }, async () => {
        // Only people who can see a space are put on its tasks; the chat form lists every space.
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
          category: system,
          metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
          annotations: [],
          autoFixRequested: false,
          ticketSystem: system,
          requesterId: requesterId ?? undefined,
        });
      });
    },
    getProject: async (id: string) => {
      const project = await projectDAO.getProject(id);
      return project ? { id: project.id, slug: project.slug } : null;
    },
    ticketUrl,

    linkTaskThread: (ticketId, thread) => linkTicketThread(ticketId, thread, adapterName),
    getTaskForThread: getTicketForThread,

    receiveThreadMessage: (params) => inbound.receive(params),
    askAgent: (params) => inbound.ask(params),
    answerQuestion: (params) => inbound.answer(params),
  };
}

const connections = new ChatConnections();

export const chatBot = new ChatBotRuntime({
  services: chatServicesFrom,
  connections,
  createBot: (adapters) => new Chat({ userName: "viberglass", adapters, state: createPostgresState({ client: pool }) }),
  registerHandlers: (bot, service) => service.provider.registerHandlers(bot, handlerServices(service)),
  onRebuilt: forgetCachedThreads,
});

export const chatBotStatus = new ChatBotStatusReader({
  refresh: () => chatBot.refresh(),
  plugins: integrationRegistry,
  connections,
});

registerConnectionChangeListener(async (system) => {
  if (chatServicesFrom().some((service) => service.system === system)) await chatBot.refresh();
});
