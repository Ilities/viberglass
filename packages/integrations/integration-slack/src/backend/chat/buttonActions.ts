import type { Chat } from "chat";
import { CHAT_ACTION, parseAskValue, parseButtonValue } from "@viberglass/integration-core";
import type { ChatHandlerServices } from "@viberglass/integration-core";

/** The buttons in a task's thread: ask the agent for the next step, or answer its question. */
export function registerButtonActionHandlers(bot: Chat, services: ChatHandlerServices): void {
  bot.onAction([CHAT_ACTION.ask], async (event) => {
    const ask = event.value ? parseAskValue(event.value) : null;
    if (!ask) return;
    try {
      await services.askAgent({ ...ask, chatUserId: event.user.userId });
    } catch (err) {
      await event.thread?.post(`_${err instanceof Error ? err.message : "Couldn't ask the agent."}_`);
    }
  });

  bot.onAction([...CHAT_ACTION.answers], async (event) => {
    const parsed = event.value ? parseButtonValue(event.value) : null;
    if (!parsed) return;
    try {
      await services.answerQuestion({ questionId: parsed[0], option: Number(parsed[1]), chatUserId: event.user.userId });
    } catch (err) {
      await event.thread?.post(`_${err instanceof Error ? err.message : "Couldn't answer the question."}_`);
    }
  });
}
