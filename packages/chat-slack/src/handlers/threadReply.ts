import type { Chat } from "chat";
import { AGENT_SESSION_STATUS, AGENT_SESSION_MODE } from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

const APPROVAL_WORDS = new Set(["approve", "approved", "yes", "lgtm", "looks good", "ok"]);
const REJECTION_WORDS = new Set(["reject", "rejected", "no", "deny"]);

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

      // @mention in a subscribed thread on a completed session — route to the same
      // advance/launch logic as threadMentionHandler. Subscribed threads never receive
      // onNewMention events, so we detect them here via message.isMention.
      if (
        message.isMention &&
        detail.session.status === AGENT_SESSION_STATUS.COMPLETED &&
        detail.session.mode !== AGENT_SESSION_MODE.EXECUTION
      ) {
        const instruction = text.replace(/^<@\S+>\s*/, "").trim();
        if (!instruction) {
          await thread.post(
            "_Please include your feedback after @viberator to revise the document._",
          );
          return;
        }

        const advance = services.resolveSessionAdvance(
          instruction,
          detail.session.mode,
        );

        if (advance.kind === "invalid") {
          await thread.post(advance.message);
          return;
        }

        if (advance.kind === "chain") {
          await thread.post(`_Starting planning session (will advance to execution automatically)…_`);
          const result = await services.launchSession({
            ticketId: detail.session.ticketId,
            clankerId: detail.session.clankerId,
            mode: advance.firstMode,
            initialMessage: "",
          });
          services.stopBridge(sessionId);
          await services.unlinkSession(sessionId);
          await services.linkSessionThread(result.session.id, thread);
          services.startBridge(result.session.id, thread, advance.thenMode);
          return;
        }

        const targetMode =
          advance.kind === "advance"
            ? advance.targetMode
            : detail.session.mode;

        if (advance.kind === "advance") {
          const label =
            targetMode === AGENT_SESSION_MODE.PLANNING
              ? "planning"
              : "execution";
          await thread.post(`_Starting ${label} session..._`);
        }

        const result = await services.launchSession({
          ticketId: detail.session.ticketId,
          clankerId: detail.session.clankerId,
          mode: targetMode,
          initialMessage: advance.kind === "advance" ? "" : instruction,
        });

        services.stopBridge(sessionId);
        await services.unlinkSession(sessionId);
        await services.linkSessionThread(result.session.id, thread);
        services.startBridge(result.session.id, thread);
        return;
      }

      if (detail.session.status === AGENT_SESSION_STATUS.WAITING_ON_APPROVAL) {
        const normalized = text.toLowerCase().trim();
        if (APPROVAL_WORDS.has(normalized)) {
          await services.approveSession(sessionId, true);
        } else if (REJECTION_WORDS.has(normalized)) {
          await services.approveSession(sessionId, false);
        } else {
          await thread.post(
            "_The agent is waiting for approval. Use the Approve/Reject buttons above, or reply `approve` or `reject`._",
          );
        }
      } else if (detail.session.status === AGENT_SESSION_STATUS.WAITING_ON_USER) {
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
