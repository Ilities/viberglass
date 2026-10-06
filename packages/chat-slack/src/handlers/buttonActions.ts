import type { Chat } from "chat";
import { parseAskValue, parseButtonValue, SLACK_ACTION } from "../actions";
import type { SlackHandlerServices } from "../types";

/** The buttons in a task's thread: ask the agent for the next step, or answer its question. */
export function registerButtonActionHandlers(bot: Chat, services: SlackHandlerServices): void {
  bot.onAction([SLACK_ACTION.ask], async (event) => {
    const ask = event.value ? parseAskValue(event.value) : null;
    if (!ask) return;
    try {
      await services.askAgent({ ...ask, slackUserId: event.user.userId });
    } catch (err) {
      await event.thread?.post(`_${err instanceof Error ? err.message : "Couldn't ask the agent."}_`);
    }
  });

  bot.onAction([...SLACK_ACTION.answers], async (event) => {
    const parsed = event.value ? parseButtonValue(event.value) : null;
    if (!parsed) return;
    try {
      await services.answerQuestion({ questionId: parsed[0], option: Number(parsed[1]), slackUserId: event.user.userId });
    } catch (err) {
      await event.thread?.post(`_${err instanceof Error ? err.message : "Couldn't answer the question."}_`);
    }
  });
}
