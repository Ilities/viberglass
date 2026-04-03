import bot from "../bot";
import {
  getSessionForThread,
  linkSessionThread,
  unlinkSession,
} from "../sessionThreadMap";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionLaunchService } from "../../services/agentSession/AgentSessionLaunchService";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import {
  AGENT_SESSION_MODE,
  AGENT_SESSION_STATUS,
  type AgentSessionMode,
} from "../../types/agentSession";
import { chatSessionBridge } from "../ChatSessionBridgeService";
import logger from "../../config/logger";

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

function detectAdvanceMode(
  instruction: string,
  currentMode: AgentSessionMode,
): { advance: true; targetMode: AgentSessionMode } | { advance: false } | { advance: "invalid"; message: string } {
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
    // Already in planning — treat as revision
    return { advance: false };
  }

  if (wantsExecute) {
    if (currentMode === AGENT_SESSION_MODE.PLANNING)
      return { advance: true, targetMode: AGENT_SESSION_MODE.EXECUTION };
    if (currentMode === AGENT_SESSION_MODE.RESEARCH)
      return {
        advance: "invalid",
        message:
          "_Cannot skip to execution. Start planning first with \"plan it\"._",
      };
    return { advance: false };
  }

  return { advance: false };
}

const agentSessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();

const launchService = new AgentSessionLaunchService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

const queryService = new AgentSessionQueryService(
  agentSessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  new AgentPendingRequestDAO(),
);

/**
 * Handle @viberator mentions in threads with completed sessions.
 *
 * After a non-execution session completes the thread is unsubscribed,
 * so @mentions route here via onNewMention instead of onSubscribedMessage.
 */
bot.onNewMention(async (thread, message) => {
  const sessionId = await getSessionForThread(thread.id);
  if (!sessionId) return;

  const text = message.text?.trim();
  if (!text) return;

  try {
    const detail = await queryService.getDetail(sessionId);
    if (!detail) return;

    if (
      detail.session.status !== AGENT_SESSION_STATUS.COMPLETED ||
      detail.session.mode === AGENT_SESSION_MODE.EXECUTION
    ) {
      return;
    }

    // Strip the leading @mention to get the instruction text
    const instruction = text.replace(/^@\S+\s*/, "").trim();
    if (!instruction) {
      await thread.post(
        "_Please include your feedback after @viberator to revise the document._",
      );
      return;
    }

    // Check for phase-advance trigger words
    const advanceResult = detectAdvanceMode(instruction, detail.session.mode);

    if (advanceResult.advance === "invalid") {
      await thread.post(advanceResult.message);
      return;
    }

    const isAdvance = advanceResult.advance === true;
    const targetMode = isAdvance ? advanceResult.targetMode : detail.session.mode;

    await thread.subscribe();

    if (isAdvance) {
      const label =
        targetMode === AGENT_SESSION_MODE.PLANNING ? "planning" : "execution";
      await thread.post(`_Starting ${label} session..._`);
    }

    const result = await launchService.launch({
      ticketId: detail.session.ticketId,
      clankerId: detail.session.clankerId,
      mode: targetMode,
      initialMessage: isAdvance ? "" : instruction,
    });

    await unlinkSession(sessionId);
    await linkSessionThread(result.session.id, thread);
    chatSessionBridge.startBridge(result.session.id, thread);

    logger.info(
      isAdvance
        ? "Phase-advance session launched from @mention"
        : "Revision session launched from @mention",
      {
        oldSessionId: sessionId,
        newSessionId: result.session.id,
        ticketId: detail.session.ticketId,
        targetMode,
      },
    );
  } catch (err) {
    logger.error("Failed to launch revision session from @mention", {
      sessionId,
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await thread.post(
      `Error: ${err instanceof Error ? err.message : "Failed to launch revision"}`,
    );
  }
});
