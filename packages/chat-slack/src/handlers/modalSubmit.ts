import { AGENT_SESSION_MODE, type AgentSessionMode } from "@viberglass/types";
import { ThreadImpl } from "chat";
import type { SlackHandlerServices } from "../types";

const VALID_MODES = new Set<string>(Object.values(AGENT_SESSION_MODE));

function toSessionMode(value: string): AgentSessionMode {
  // Safe: Set.has() cannot narrow string to AgentSessionMode; runtime check is the guard.
  if (VALID_MODES.has(value)) return value as AgentSessionMode;
  throw new Error(`Invalid session mode: ${value}`);
}

export function registerModalSubmitHandler(
  bot: import("chat").Chat,
  services: SlackHandlerServices,
): void {
  bot.onModalSubmit("viberator_launch", async (event) => {
    const { projectId, clankerId, mode, message, title: rawTitle } = event.values;

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

    const title =
      rawTitle?.trim() || message.split("\n")[0].slice(0, 120) || "Chat-initiated job";

    try {

      const ticketPhase = toSessionMode(mode);
      const ticket = await services.createTicket({
        projectId,
        title,
        description: message,
        phase: ticketPhase,
      });

      const job = await services.runJob({
        ticketId: ticket.id,
        clankerId,
        mode: ticketPhase,
      });

      const channel = event.relatedChannel;
      if (!channel) return;

      const project = await services.getProject(projectId);
      const projectSlug = project?.slug ?? projectId;
      const url = services.ticketUrl(projectSlug, ticket.id);
      const ticketRef = url ? `[${title}](${url})` : title;
      const sent = await channel.post({ markdown: `_${mode}_ | ${ticketRef} — job queued.` });

      // Build a Thread from the sent message for the ticket-thread mapping
      const thread = new ThreadImpl({ adapterName: "slack", id: sent.threadId, channelId: channel.id });
      await services.linkTicketThread(ticket.id, thread, clankerId, ticketPhase);
    } catch (err) {
      const channel = event.relatedChannel;
      if (channel) {
        await channel.post(
          `Failed to launch job: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  });
}
