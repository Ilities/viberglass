import { AGENT_SESSION_MODE, type AgentSessionMode } from "@viberglass/types";

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

export type SessionAdvanceResult =
  | { kind: "advance"; targetMode: AgentSessionMode }
  | { kind: "revise" }
  | { kind: "invalid"; message: string };

export function resolveSessionAdvance(
  instruction: string,
  currentMode: AgentSessionMode,
): SessionAdvanceResult {
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
      return { kind: "advance", targetMode: AGENT_SESSION_MODE.PLANNING };
    if (currentMode === AGENT_SESSION_MODE.PLANNING)
      return { kind: "advance", targetMode: AGENT_SESSION_MODE.EXECUTION };
    return { kind: "revise" };
  }

  if (wantsPlan) {
    if (currentMode === AGENT_SESSION_MODE.RESEARCH)
      return { kind: "advance", targetMode: AGENT_SESSION_MODE.PLANNING };
    return { kind: "revise" };
  }

  if (wantsExecute) {
    if (currentMode === AGENT_SESSION_MODE.PLANNING)
      return { kind: "advance", targetMode: AGENT_SESSION_MODE.EXECUTION };
    if (currentMode === AGENT_SESSION_MODE.RESEARCH) {
      return {
        kind: "invalid",
        message:
          '_Cannot skip to execution. Start planning first with "plan it"._',
      };
    }
    return { kind: "revise" };
  }

  return { kind: "revise" };
}
