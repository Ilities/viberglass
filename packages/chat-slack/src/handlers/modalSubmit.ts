import { ThreadImpl } from "chat";
import type { Chat } from "chat";
import { AGENT_SESSION_MODE, type AgentSessionMode } from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

const VALID_MODES = new Set<string>(Object.values(AGENT_SESSION_MODE));

function toSessionMode(value: string): AgentSessionMode {
  // Safe: Set.has() cannot narrow string to AgentSessionMode; runtime check is the guard.
  if (VALID_MODES.has(value)) return value as AgentSessionMode;
  throw new Error(`Invalid session mode: ${value}`);
}

export function registerModalSubmitHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
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

    const title =
      message.split("\n")[0].slice(0, 120) || "Chat-initiated session";

    try {
      const ticket = await services.createTicket({
        projectId,
        title,
        description: message,
      });

      const result = await services.launchSession({
        ticketId: ticket.id,
        clankerId,
        mode: toSessionMode(mode),
        initialMessage: message,
      });

      const channel = event.relatedChannel;
      if (!channel) return;

      const url = services.ticketUrl(projectId, ticket.id);
      const ticketRef = url ? `[View ticket](${url})` : title;
      const sent = await channel.post({ markdown: `_${mode}_ | ${ticketRef}` });

      // channel.post() returns a synthetic threadId with empty threadTs.
      // sent.id is the actual message timestamp (thread_ts). Rebuild so that
      // subsequent thread.post() calls create replies in the correct thread.
      const rawParts = sent.threadId.split(":");
      const channelId = rawParts.slice(0, -1).join(":");
      const threadTs = rawParts[rawParts.length - 1] || sent.id;
      const threadId = `${channelId}:${threadTs}`;
      const thread = new ThreadImpl({
        adapterName: "slack",
        id: threadId,
        channelId,
      });

      await thread.post({
        markdown: `*Prompt:*`,
        files: [
          {
            data: Buffer.from(message),
            filename: "prompt.txt",
            mimeType: "text/plain",
          },
        ],
      });
      await thread.subscribe();
      await services.linkSessionThread(result.session.id, thread);
      services.startBridge(result.session.id, thread);
    } catch (err) {
      const channel = event.relatedChannel;
      if (channel) {
        await channel.post(
          `Failed to launch session: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  });
}
