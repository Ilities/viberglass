import type { Chat } from "chat";
import { registerSlashCommandHandler } from "./handlers/slashCommand";
import { registerModalSubmitHandler } from "./handlers/modalSubmit";
import { registerThreadReplyHandler } from "./handlers/threadReply";
import { registerThreadMentionHandler } from "./handlers/threadMention";
import { registerApprovalActionHandler } from "./handlers/approvalAction";

export type { SlackHandlerServices, SessionDetail, ProjectSummary, ClankerSummary } from "./types";

/**
 * Register all Slack chat handlers on the given bot instance.
 *
 * Call this once in your composition root after initialising the Chat SDK bot.
 * Pass a `services` implementation that wires the handlers to your backend logic.
 */
export function registerSlackHandlers(
  bot: Chat,
  services: import("./types").SlackHandlerServices,
): void {
  registerSlashCommandHandler(bot, services);
  registerModalSubmitHandler(bot, services);
  registerThreadReplyHandler(bot, services);
  registerThreadMentionHandler(bot, services);
  registerApprovalActionHandler(bot, services);
}
