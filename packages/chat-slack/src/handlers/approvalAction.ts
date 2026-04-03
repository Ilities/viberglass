import type { Chat } from "chat";
import type { SlackHandlerServices } from "../types";

export function registerApprovalActionHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onAction(["session_approve", "session_reject"], async (event) => {
    const sessionId = event.value;
    if (!sessionId) return;

    const approved = event.actionId === "session_approve";
    const thread = event.thread;

    try {
      await services.approveSession(sessionId, approved);
      if (thread) {
        await thread.post(
          approved
            ? `Approved by ${event.user.fullName ?? event.user.userName}.`
            : `Rejected by ${event.user.fullName ?? event.user.userName}.`,
        );
      }
    } catch (err) {
      if (thread) {
        await thread.post(
          `Error: ${err instanceof Error ? err.message : "Failed to process approval"}`,
        );
      }
    }
  });
}
