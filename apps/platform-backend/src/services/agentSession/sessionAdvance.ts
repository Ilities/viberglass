import {
  AGENT_SESSION_MODE,
  type AgentSessionMode,
  TICKET_WORKFLOW_PHASE,
  type TicketWorkflowPhase,
} from "@viberglass/types";

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

const APPROVE_TRIGGERS = new Set(["lgtm", "approved", "looks good", "approve"]);

const ADVANCE_TRIGGERS = new Set(["next", "proceed", "continue"]);

export type SessionAdvanceResult =
  | { kind: "advance"; targetMode: AgentSessionMode }
  | { kind: "chain"; firstMode: AgentSessionMode; thenMode: AgentSessionMode }
  | { kind: "revise" }
  | { kind: "invalid"; message: string };

export type TicketAdvanceResult =
  | { kind: "advance"; targetPhase: TicketWorkflowPhase }
  | { kind: "chain"; firstPhase: TicketWorkflowPhase; thenPhase: TicketWorkflowPhase }
  | { kind: "revise" };

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
    if (currentMode === AGENT_SESSION_MODE.RESEARCH)
      return { kind: "chain", firstMode: AGENT_SESSION_MODE.PLANNING, thenMode: AGENT_SESSION_MODE.EXECUTION };
    return { kind: "revise" };
  }

  return { kind: "revise" };
}

/**
 * Resolve a user instruction for a ticket-based workflow.
 * Same keyword logic as resolveSessionAdvance but returns TicketWorkflowPhase values.
 */
export function resolveTicketAdvance(
  instruction: string,
  currentPhase: TicketWorkflowPhase,
): TicketAdvanceResult {
  // Normalize: lowercase, trim whitespace, strip leading/trailing punctuation
  // so "lgtm!" / "lgtm." / " lgtm " all match.
  const normalized = instruction
    .toLowerCase()
    .trim()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();

  // Once execution has started, everything is a revision request (which the
  // Slack handler rejects). This keeps the resolver behaviour tidy.
  if (currentPhase === TICKET_WORKFLOW_PHASE.EXECUTION) {
    return { kind: "revise" };
  }

  const wantsPlan =
    PLAN_TRIGGERS.has(normalized) ||
    (APPROVE_TRIGGERS.has(normalized) && currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH);
  const wantsExecute =
    EXECUTE_TRIGGERS.has(normalized) ||
    (APPROVE_TRIGGERS.has(normalized) && currentPhase === TICKET_WORKFLOW_PHASE.PLANNING);
  const wantsNext = ADVANCE_TRIGGERS.has(normalized);

  if (wantsNext) {
    if (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH)
      return { kind: "advance", targetPhase: TICKET_WORKFLOW_PHASE.PLANNING };
    if (currentPhase === TICKET_WORKFLOW_PHASE.PLANNING)
      return { kind: "advance", targetPhase: TICKET_WORKFLOW_PHASE.EXECUTION };
    return { kind: "revise" };
  }

  if (wantsPlan) {
    if (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH)
      return { kind: "advance", targetPhase: TICKET_WORKFLOW_PHASE.PLANNING };
    return { kind: "revise" };
  }

  if (wantsExecute) {
    if (currentPhase === TICKET_WORKFLOW_PHASE.PLANNING)
      return { kind: "advance", targetPhase: TICKET_WORKFLOW_PHASE.EXECUTION };
    if (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH)
      return {
        kind: "chain",
        firstPhase: TICKET_WORKFLOW_PHASE.PLANNING,
        thenPhase: TICKET_WORKFLOW_PHASE.EXECUTION,
      };
    return { kind: "revise" };
  }

  return { kind: "revise" };
}
