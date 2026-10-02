import type { Chat } from "chat";
import { registerSlashCommandHandler } from "./handlers/slashCommand";
import { registerModalSubmitHandler } from "./handlers/modalSubmit";
import { registerThreadMessageHandler } from "./handlers/threadMessage";
import { registerButtonActionHandlers } from "./handlers/buttonActions";
import type { SlackHandlerServices } from "./types";

export type { SlackHandlerServices, ProjectSummary, ClankerSummary } from "./types";
export { SLACK_ACTION, MAX_OPTION_BUTTONS, askValue, answerValue } from "./actions";

/**
 * Register all Slack chat handlers on the given bot instance.
 *
 * Call this once in your composition root after initialising the Chat SDK bot.
 * Pass a `services` implementation that wires the handlers to your backend logic.
 */
export function registerSlackHandlers(bot: Chat, services: SlackHandlerServices): void {
  registerSlashCommandHandler(bot, services);
  registerModalSubmitHandler(bot, services);
  registerThreadMessageHandler(bot, services);
  registerButtonActionHandlers(bot, services);
}
