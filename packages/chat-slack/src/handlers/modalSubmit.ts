import {AGENT_SESSION_MODE, type AgentSessionMode} from "@viberglass/types";
import {ThreadImpl} from "chat";
import type {SlackHandlerServices} from "../types";

const VALID_MODES = new Set(Object.values(AGENT_SESSION_MODE));

function isSessionMode(value: string): value is AgentSessionMode {
  return VALID_MODES.has(value as AgentSessionMode);
}

function toSessionMode(value: string): AgentSessionMode {
  if (isSessionMode(value)) return value;
  throw new Error(`Invalid session mode: ${value}`);
}

/**
 * Build a Slack thread ID that includes the message timestamp as threadTs.
 *
 * When `channel.post()` is used (not inside an existing thread), the Slack
 * adapter's `postChannelMessage` returns a synthetic thread ID like
 * `slack:C123:` with an *empty* threadTs. We must replace that empty threadTs
 * with the sent message's ID (a Slack timestamp like `1234567890.123456`) so
 * that subsequent `thread.post()` calls send replies under the parent message.
 */
function buildSlackThreadId(
  channelId: string,
  sentThreadId: string,
  sentMessageId: string,
): string {
  const baseThreadId = sentThreadId || channelId;
  const parts = baseThreadId.split(":");
  // parts[2] is the threadTs — if it's present but empty (e.g. "slack:C123:")
  // we need to fill it with the message timestamp so replies thread correctly.
  if (parts.length >= 3 && parts[2]) return baseThreadId;
  return `${parts[0]}:${parts[1]}:${sentMessageId}`;
}

export function registerModalSubmitHandler(
  bot: import("chat").Chat,
  services: SlackHandlerServices,
): void {
  bot.onModalSubmit("viberator_launch", async (event) => {
    const {projectId, clankerId, mode, message, title: rawTitle} = event.values;
    const channel = event.relatedChannel;
    let thread: ThreadImpl | null = null;
    let threadError: string | null = null;

    if (!projectId || !clankerId || !mode || !message) {
      return {
        action: "errors",
        errors: {
          ...(projectId ? {} : {projectId: "Required"}),
          ...(clankerId ? {} : {clankerId: "Required"}),
          ...(mode ? {} : {mode: "Required"}),
          ...(message ? {} : {message: "Required"}),
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

      const clanker = (await services.listClankers()).find((c) => c.id === clankerId);
      const clankerName = clanker?.name ?? clankerId;

      const project = await services.getProject(projectId);
      const projectSlug = project?.slug ?? projectId;
      const url = services.ticketUrl(projectSlug, ticket.id);
      const ticketRef = url ? `[${title}](${url})` : title;

      if (channel) {
        try {
          const sent = await channel.post({
            markdown: `*Job started:* ${ticketRef}`,
          });

          // Build a Thread from the sent message for the ticket-thread mapping
          const threadId = buildSlackThreadId(channel.id, sent.threadId, sent.id);
          thread = new ThreadImpl({adapterName: "slack", id: threadId, channelId: channel.id});
          await services.linkTicketThread(ticket.id, thread, clankerId, ticketPhase);

          // Post the detailed message to the new thread
          await thread.post({
            markdown:
              `> *Mode:* _${mode}_\n` +
              `> *Clanker:* ${clankerName}\n` +
              `> *Task:* ${message.length > 500 ? message.slice(0, 500) + "..." : message}`,
          });
        } catch (err) {
          threadError = err instanceof Error ? err.message : "Unknown error";
        }
      }

      try {
        await services.runJob({
          ticketId: ticket.id,
          clankerId,
          mode: ticketPhase,
        });
      } catch (err) {
        const errorMessage = `Failed to launch job: ${err instanceof Error ? err.message : "Unknown error"}`;
        if (thread) {
          try {
            await thread.post(errorMessage);
            return;
          } catch {
            // Fall through to channel if thread post fails.
          }
        }
        if (channel) {
          await channel.post(errorMessage);
        }
        return;
      }

      if (threadError && channel) {
        try {
          await channel.post(
            `Job started, but failed to create the thread: ${threadError}`,
          );
        } catch {
          // Best-effort: job already started, avoid masking the success.
        }
      }
    } catch (err) {
      if (channel) {
        await channel.post(
          `Failed to launch job: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  });
}
