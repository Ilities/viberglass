import type { Chat } from "chat";
import {
  AGENT_SESSION_STATUS,
  AGENT_SESSION_MODE,
  AgentSessionMode,
} from "@viberglass/types";
import type { SlackHandlerServices } from "../types";

const PLAN_TRIGGERS = new Set([
  "plan",
  "plan it",
  "start planning",
  "move to planning",
]);

const EXECUTE_TRIGGERS = new Set([
  "execute",
  "do it",
  "let's go",
  "ship it",
  "run it",
  "start execution",
  "move to execution",
  "go",
]);

const APPROVE_TRIGGERS = new Set(["lgtm", "approved", "looks good"]);

const ADVANCE_TRIGGERS = new Set(["next", "proceed", "continue"]);

type AdvanceResult =
  | { advance: true; targetMode: AgentSessionMode }
  | { advance: false }
  | { advance: "invalid"; message: string };

function detectAdvanceMode(
  instruction: string,
  currentMode: string,
): AdvanceResult {
  const normalized = instruction.toLowerCase().trim();

  const wantsPlan =
    PLAN_TRIGGERS.has(normalized) ||
    (APPROVE_TRIGGERS.has(normalized) &&
      currentMode === AGENT_SESSION_MODE.RESEARCH);
  const wantsExecute =
    EXECUTE_TRIGGERS.has(normalized) ||
    (APPROVE_TRIGGERS.has(normalized) &&
      currentMode === AGENT_SESSION_MODE.PLANNING);
  const wantsNext = ADVANCE_TRIGGERS.has(normalized);

  if (wantsNext) {
    if (currentMode === AGENT_SESSION_MODE.RESEARCH)
      return { advance: true, targetMode: AGENT_SESSION_MODE.PLANNING };
    if (currentMode === AGENT_SESSION_MODE.PLANNING)
      return { advance: true, targetMode: AGENT_SESSION_MODE.EXECUTION };
    return { advance: false };
  }

  if (wantsPlan) {
    if (currentMode === AGENT_SESSION_MODE.RESEARCH)
      return { advance: true, targetMode: AGENT_SESSION_MODE.PLANNING };
    return { advance: false };
  }

  if (wantsExecute) {
    if (currentMode === AGENT_SESSION_MODE.PLANNING)
      return { advance: true, targetMode: AGENT_SESSION_MODE.EXECUTION };
    if (currentMode === AGENT_SESSION_MODE.RESEARCH) {
      return {
        advance: "invalid",
        message:
          '_Cannot skip to execution. Start planning first with "plan it"._',
      };
    }
    return { advance: false };
  }

  return { advance: false };
}

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

      const instruction = text.replace(/^@\S+\s*/, "").trim();
      if (!instruction) {
        await thread.post(
          "_Please include your feedback after @viberator to revise the document._",
        );
        return;
      }

      const advanceResult = detectAdvanceMode(instruction, detail.session.mode);

      if (advanceResult.advance === "invalid") {
        await thread.post(advanceResult.message);
        return;
      }

      const isAdvance = advanceResult.advance === true;
      const targetMode = isAdvance
        ? advanceResult.targetMode
        : detail.session.mode;

      await thread.subscribe();

      if (isAdvance) {
        const label =
          targetMode === AGENT_SESSION_MODE.PLANNING ? "planning" : "execution";
        await thread.post(`_Starting ${label} session..._`);
      }

      const result = await services.launchSession({
        ticketId: detail.session.ticketId,
        clankerId: detail.session.clankerId,
        mode: targetMode,
        initialMessage: isAdvance ? "" : instruction,
      });

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
