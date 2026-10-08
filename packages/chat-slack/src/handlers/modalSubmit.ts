import type { TaskTurnAction } from "@viberglass/types";
import { ThreadImpl } from "chat";
import type { SlackHandlerServices } from "../types";

/** What the launch form's step asks the agent for. */
const ACTION_OF_MODE: Record<string, TaskTurnAction> = { planning: "plan", execution: "code" };

/**
 * Build a Slack thread ID that includes the message timestamp as threadTs.
 *
 * When `channel.post()` is used (not inside an existing thread), the Slack
 * adapter's `postChannelMessage` returns a synthetic thread ID like
 * `slack:C123:` with an *empty* threadTs. We must replace that empty threadTs
 * with the sent message's ID (a Slack timestamp like `1234567890.123456`) so
 * that subsequent `thread.post()` calls send replies under the parent message.
 */
function buildSlackThreadId(channelId: string, sentThreadId: string, sentMessageId: string): string {
  const baseThreadId = sentThreadId || channelId;
  const parts = baseThreadId.split(":");
  // parts[2] is the threadTs — if it's present but empty (e.g. "slack:C123:")
  // we need to fill it with the message timestamp so replies thread correctly.
  if (parts.length >= 3 && parts[2]) return baseThreadId;
  return `${parts[0]}:${parts[1]}:${sentMessageId}`;
}

/**
 * The launch form: creates the task, starts its thread in the channel, then
 * asks the agent for the first step. The thread is the task's from then on.
 */
export function registerModalSubmitHandler(bot: import("chat").Chat, services: SlackHandlerServices): void {
  bot.onModalSubmit("viberglass_launch", async (event) => {
    const { projectId, clankerId, mode, message, title: rawTitle } = event.values;
    const channel = event.relatedChannel;

    const action = mode ? ACTION_OF_MODE[mode] : undefined;
    if (!projectId || !clankerId || !action || !message) {
      return {
        action: "errors",
        errors: {
          ...(projectId ? {} : { projectId: "Required" }),
          ...(clankerId ? {} : { clankerId: "Required" }),
          ...(action ? {} : { mode: "Required" }),
          ...(message ? {} : { message: "Required" }),
        },
      };
    }

    const title = rawTitle?.trim() || message.split("\n")[0].slice(0, 120) || "Asked from Slack";
    try {
      const ticket = await services.createTicket({ projectId, title, description: message, slackUserId: event.user.userId });
      const project = await services.getProject(projectId);
      const url = services.ticketUrl(project?.slug ?? projectId, ticket.id);

      if (channel) {
        const sent = await channel.post({ markdown: `*Task:* ${url ? `[${title}](${url})` : title}` });
        const thread = new ThreadImpl({ adapterName: "slack", id: buildSlackThreadId(channel.id, sent.threadId, sent.id), channelId: channel.id });
        await services.linkTaskThread(ticket.id, thread);
        await thread.subscribe();
        await thread.post({ markdown: `> ${message.length > 500 ? `${message.slice(0, 500)}…` : message}` });
      }

      await services.askAgent({ ticketId: ticket.id, slackUserId: event.user.userId, action, agentId: clankerId });
    } catch (err) {
      await channel?.post(`Couldn't start the task: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  });
}
