import { ThreadImpl } from "chat";
import bot from "../bot";
import { chatSessionBridge } from "../ChatSessionBridgeService";
import { linkSessionThread } from "../sessionThreadMap";
import { ticketUrl } from "../platformLinks";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { AgentSessionLaunchService } from "../../services/agentSession/AgentSessionLaunchService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import logger from "../../config/logger";
import type { CreateTicketRequest } from "@viberglass/types";
import type { AgentSessionMode } from "../../types/agentSession";

const ticketDAO = new TicketDAO();
const launchService = new AgentSessionLaunchService(
  new AgentSessionDAO(),
  new AgentTurnDAO(),
  new AgentSessionEventDAO(),
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

bot.onModalSubmit("viberator_launch", async (event) => {
  const { projectId, clankerId, mode, message } = event.values;

  if (!projectId || !clankerId || !mode || !message) {
    return {
      action: "errors" as const,
      errors: {
        ...(projectId ? {} : { projectId: "Required" }),
        ...(clankerId ? {} : { clankerId: "Required" }),
        ...(mode ? {} : { mode: "Required" }),
        ...(message ? {} : { message: "Required" }),
      },
    };
  }

  // Extract title from first line of message, fall back to truncated message
  const title =
    message.split("\n")[0].slice(0, 120) || "Slack-initiated session";

  try {
    const ticketRequest: CreateTicketRequest = {
      projectId,
      title,
      description: message,
      severity: "medium",
      category: "slack",
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
      ticketSystem: "slack",
    };

    const ticket = await ticketDAO.createTicket(ticketRequest);

    const result = await launchService.launch({
      ticketId: ticket.id,
      clankerId,
      mode: mode as AgentSessionMode,
      initialMessage: message,
    });

    // Post the initial message to the channel, creating a thread
    const channel = event.relatedChannel;
    if (!channel) {
      logger.warn("No related channel for viberator_launch modal submit");
      return;
    }

    const url = ticketUrl(projectId, ticket.id);
    const ticketRef = url ? `[View ticket](${url})` : title;
    const sent = await channel.post({ markdown: `_${mode}_ | ${ticketRef}` });

    // channel.post() returns a synthetic threadId with empty threadTs.
    // sent.id is the actual message timestamp, which is the thread_ts for replies.
    // We rebuild the threadId using sent.id so thread.post() creates thread replies.
    const rawParts = sent.threadId.split(":");
    const channelId = rawParts.slice(0, -1).join(":");
    const threadTs = rawParts[rawParts.length - 1] || sent.id;
    const threadId = `${channelId}:${threadTs}`;
    const thread = new ThreadImpl({
      adapterName: "slack",
      id: threadId,
      channelId,
    });

    await thread.post({ markdown: `*Prompt:*\n${message}` });
    await thread.subscribe();
    await linkSessionThread(result.session.id, thread);
    chatSessionBridge.startBridge(result.session.id, thread);

    logger.info("Slack agent session launched", {
      sessionId: result.session.id,
      ticketId: ticket.id,
      projectId,
      clankerId,
      mode,
    });
  } catch (err) {
    logger.error("Failed to launch agent session from Slack", {
      error: err instanceof Error ? err.message : String(err),
      projectId,
      clankerId,
    });

    const channel = event.relatedChannel;
    if (channel) {
      await channel.post(
        `Failed to launch session: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }
});
