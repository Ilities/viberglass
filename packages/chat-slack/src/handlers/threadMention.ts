import type { Chat } from "chat";
import { AGENT_SESSION_STATUS, AGENT_SESSION_MODE,TicketWorkflowPhase } from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

export function registerThreadMentionHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onNewMention(async (thread, message) => {
    const text = message.text?.trim();
    if (!text) return;

    console.info("[chat-slack:threadMention] handler entry", {
      threadId: thread.id,
      rawText: text,
    });

    // First check if this is a ticket-based thread (job flow)
    const ticketMapping = await services.getTicketForThread(thread.id);

    console.info("[chat-slack:threadMention] ticket mapping lookup", {
      threadId: thread.id,
      ticketId: ticketMapping?.ticketId ?? null,
      mode: ticketMapping?.mode ?? null,
    });

    if (ticketMapping) {
      // Strip all @mentions (including trailing ones from Slack mobile) and collapse whitespace
      const instruction = text.replace(/<@\S+>/g, " ").replace(/\s+/g, " ").trim();

      console.info("[chat-slack:threadMention] cleaned instruction", {
        threadId: thread.id,
        instruction,
      });

      if (!instruction) {
        await thread.post(
          "_Please include your feedback after @viberator to revise, or say \"plan it\" / \"execute\" to advance._",
        );
        return;
      }

      if (ticketMapping.mode === "execution") {
        await thread.post("_Execution jobs cannot be revised. Create a new ticket to start over._");
        return;
      }

      const advance = services.resolveTicketAdvance(
        instruction,
        ticketMapping.mode as TicketWorkflowPhase
      );

      console.info("[chat-slack:threadMention] resolveTicketAdvance result", {
        threadId: thread.id,
        kind: advance.kind,
        ...(advance.kind === "advance" ? { targetPhase: advance.targetPhase } : {}),
        ...(advance.kind === "chain" ? { firstPhase: advance.firstPhase, thenPhase: advance.thenPhase } : {}),
      });

      if (advance.kind === "advance") {
        try {
          await thread.post(`_Advancing to ${advance.targetPhase}…_`);
          await services.advanceAndRunTicketJob({
            ticketId: ticketMapping.ticketId,
            clankerId: ticketMapping.clankerId,
            targetPhase: advance.targetPhase,
          });
        } catch (err) {
          await thread.post(
            `Error: ${err instanceof Error ? err.message : "Failed to advance phase"}`,
          );
        }
        return;
      }

      if (advance.kind === "chain") {
        try {
          await thread.post(
            `_Advancing to ${advance.firstPhase} (will auto-continue to ${advance.thenPhase})…_`,
          );
          await services.chainAndRunTicketJob({
            ticketId: ticketMapping.ticketId,
            clankerId: ticketMapping.clankerId,
            firstPhase: advance.firstPhase,
            thenPhase: advance.thenPhase,
          });
        } catch (err) {
          await thread.post(
            `Error: ${err instanceof Error ? err.message : "Failed to advance phase"}`,
          );
        }
        return;
      }

      // No keyword matched — treat as revision
      try {
        await thread.post("_Revision job queued…_");
        await services.runRevisionJob({
          ticketId: ticketMapping.ticketId,
          clankerId: ticketMapping.clankerId,
          mode: ticketMapping.mode as "research" | "planning",
          revisionMessage: instruction,
        });
      } catch (err) {
        await thread.post(
          `Error: ${err instanceof Error ? err.message : "Failed to launch revision job"}`,
        );
      }
      return;
    }

    // Fall through to session-based logic for backward compatibility
    const sessionId = await services.getSessionForThread(thread.id);
    if (!sessionId) return;

    try {
      const detail = await services.getSessionDetail(sessionId);
      if (!detail) return;

      if (
        detail.session.status !== AGENT_SESSION_STATUS.COMPLETED ||
        detail.session.mode === AGENT_SESSION_MODE.EXECUTION
      ) {
        return;
      }

      const instruction = text.replace(/<@\S+>/g, " ").replace(/\s+/g, " ").trim();
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
