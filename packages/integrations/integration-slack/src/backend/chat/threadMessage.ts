import type { Chat, Message, Thread } from "chat";
import type { ChatHandlerServices } from "@viberglass/integration-core";

/** Messages in a task's Slack thread go to the task, as whoever wrote them. */
export function registerThreadMessageHandler(bot: Chat, services: ChatHandlerServices): void {
  const relay = async (thread: Thread, message: Message, mentionsBot: boolean) => {
    if (message.author.isMe || message.author.isBot === true) return;
    const text = message.text?.trim();
    if (!text) return;
    const ticketId = await services.getTaskForThread(thread.id);
    if (!ticketId) return;
    try {
      await services.receiveThreadMessage({ ticketId, chatUserId: message.author.userId, text, mentionsBot });
    } catch (err) {
      await thread.post(`_${err instanceof Error ? err.message : "That didn't reach the task."}_`);
    }
  };

  bot.onSubscribedMessage((thread, message) => relay(thread, message, message.isMention === true));
  // A mention in a task's thread that isn't subscribed yet (after a restart that lost the subscription).
  bot.onNewMention(async (thread, message) => {
    if (!(await services.getTaskForThread(thread.id))) return;
    await thread.subscribe();
    await relay(thread, message, true);
  });
}
