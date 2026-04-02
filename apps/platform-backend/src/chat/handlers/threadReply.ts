import bot from "../bot";
import { getSessionForThread, linkSessionThread, unlinkSession } from "../sessionThreadMap";
import { AgentSessionInteractionService } from "../../services/agentSession/AgentSessionInteractionService";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionLaunchService } from "../../services/agentSession/AgentSessionLaunchService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import { AGENT_SESSION_MODE, AGENT_SESSION_STATUS } from "../../types/agentSession";
import { chatSessionBridge } from "../ChatSessionBridgeService";
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

const launchService = new AgentSessionLaunchService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
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

  logger.info("onSubscribedMessage fired", {
    threadId: thread.id,
    sessionId,
    isMention: message.isMention,
    text: message.text?.slice(0, 200),
  });

  if (!sessionId) return;

  const text = message.text?.trim();
  if (!text) return;

  try {
    const detail = await queryService.getDetail(sessionId);
    if (!detail) {
      await thread.post("Session not found.");
      return;
    }

    if (
      detail.session.status === AGENT_SESSION_STATUS.COMPLETED &&
      detail.session.mode !== AGENT_SESSION_MODE.EXECUTION
    ) {
      logger.info("Completed session thread message", {
        sessionId,
        isMention: message.isMention,
        text: text.slice(0, 200),
      });
      if (!message.isMention) return;

      // Strip the leading @mention to get the instruction text
      const instruction = text.replace(/^@\S+\s*/, "").trim();
      if (!instruction) {
        await thread.post(
          "_Please include your feedback after @viberator to revise the document._",
        );
        return;
      }

      const result = await launchService.launch({
        ticketId: detail.session.ticketId,
        clankerId: detail.session.clankerId,
        mode: detail.session.mode,
        initialMessage: instruction,
      });
      // Only unlink old session after successful launch to avoid dangling state
      await unlinkSession(sessionId);
      await linkSessionThread(result.session.id, thread);
      chatSessionBridge.startBridge(result.session.id, thread);
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
