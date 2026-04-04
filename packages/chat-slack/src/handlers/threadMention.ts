import type { Chat } from "chat";
import { AGENT_SESSION_STATUS, AGENT_SESSION_MODE } from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

export function registerThreadMentionHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onNewMention(async (thread, message) => {
    const sessionId = await services.getSessionForThread(thread.id);
    if (!sessionId) return;

    const text = message.text?.trim();
    if (!text) return;

    try {
      const detail = await services.getSessionDetail(sessionId);
      if (!detail) return;

      if (
        detail.session.status !== AGENT_SESSION_STATUS.COMPLETED ||
        detail.session.mode === AGENT_SESSION_MODE.EXECUTION
      ) {
        return;
      }

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
        await thread.subscribe();
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

      await thread.subscribe();

      if (advance.kind === "advance") {
        const label =
          targetMode === AGENT_SESSION_MODE.PLANNING ? "planning" : "execution";
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
    } catch (err) {
      await thread.post(
        `Error: ${err instanceof Error ? err.message : "Failed to launch revision"}`,
      );
    }
  });
}
