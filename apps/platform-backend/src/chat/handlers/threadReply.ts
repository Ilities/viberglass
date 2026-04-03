import bot from "../bot";
import { getSessionForThread } from "../sessionThreadMap";
import { AgentSessionInteractionService } from "../../services/agentSession/AgentSessionInteractionService";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import { AGENT_SESSION_STATUS } from "../../types/agentSession";
import logger from "../../config/logger";

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();

const interactionService = new AgentSessionInteractionService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

const queryService = new AgentSessionQueryService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
);

bot.onSubscribedMessage(async (thread, message) => {
  const sessionId = await getSessionForThread(thread.id);
  if (!sessionId) return;

  const text = message.text?.trim();
  if (!text) return;

  try {
    const detail = await queryService.getDetail(sessionId);
    if (!detail) {
      await thread.post("Session not found.");
      return;
    }

    if (detail.session.status === AGENT_SESSION_STATUS.WAITING_ON_USER) {
      await interactionService.reply(sessionId, text);
    } else {
      await interactionService.sendMessage(sessionId, text);
    }
  } catch (err) {
    logger.error("Failed to route thread reply to session", {
      sessionId,
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await thread.post(
      `Error: ${err instanceof Error ? err.message : "Failed to send message"}`,
    );
  }
});
