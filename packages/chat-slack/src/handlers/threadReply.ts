import type { Chat } from "chat";
import { AGENT_SESSION_STATUS } from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

export function registerThreadReplyHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onSubscribedMessage(async (thread, message) => {
    const sessionId = await services.getSessionForThread(thread.id);
    if (!sessionId) return;

    const text = message.text?.trim();
    if (!text) return;

    try {
      const detail = await services.getSessionDetail(sessionId);
      if (!detail) {
        await thread.post("Session not found.");
        return;
      }

      if (detail.session.status === AGENT_SESSION_STATUS.WAITING_ON_USER) {
        await services.replyToSession(sessionId, text);
      } else {
        await services.sendMessageToSession(sessionId, text);
      }
    } catch (err) {
      await thread.post(
        `Error: ${err instanceof Error ? err.message : "Failed to send message"}`,
      );
    }
  });
}
