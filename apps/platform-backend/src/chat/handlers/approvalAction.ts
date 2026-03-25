import bot from "../bot";
import { AgentSessionInteractionService } from "../../services/agentSession/AgentSessionInteractionService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import logger from "../../config/logger";

const interactionService = new AgentSessionInteractionService(
  new AgentSessionDAO(),
  new AgentTurnDAO(),
  new AgentSessionEventDAO(),
  new AgentPendingRequestDAO(),
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

bot.onAction(["session_approve", "session_reject"], async (event) => {
  const sessionId = event.value;
  if (!sessionId) return;

  const approved = event.actionId === "session_approve";
  const thread = event.thread;

  try {
    await interactionService.approve(sessionId, approved);
    if (thread) {
      await thread.post(
        approved
          ? `Approved by ${event.user.fullName ?? event.user.userName}.`
          : `Rejected by ${event.user.fullName ?? event.user.userName}.`,
      );
    }
  } catch (err) {
    logger.error("Failed to process approval action", {
      sessionId,
      approved,
      error: err instanceof Error ? err.message : String(err),
    });
    if (thread) {
      await thread.post(
        `Error: ${err instanceof Error ? err.message : "Failed to process approval"}`,
      );
    }
  }
});
