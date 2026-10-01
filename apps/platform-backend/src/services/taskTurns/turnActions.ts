import {
  AGENT_SESSION_MODE,
  type AgentSessionMode,
  type JobKind,
  type TaskTurnAction,
  type TicketWorkflowPhase,
} from "@viberglass/types";

/** The job a turn runs as. Runs are still listed by kind, so a turn reads as the step it works on. */
export const TURN_JOB_KIND: Record<TaskTurnAction, JobKind> = {
  research: "research",
  plan: "planning",
  code: "execution",
  reply: "reply",
  summarise: "reply",
};

/**
 * The step a new session is filed under. Sessions are per agent now, so this
 * only names what the session started with.
 */
export function sessionModeFor(action: TaskTurnAction, phase: TicketWorkflowPhase): AgentSessionMode {
  if (action === "research") return AGENT_SESSION_MODE.RESEARCH;
  if (action === "plan") return AGENT_SESSION_MODE.PLANNING;
  if (action === "code") return AGENT_SESSION_MODE.EXECUTION;
  return phase;
}

/** The turn that does a step's work. */
export const ACTION_FOR_PHASE: Record<TicketWorkflowPhase, TaskTurnAction> = {
  research: "research",
  planning: "plan",
  execution: "code",
};

/** What a suggested action posts in the thread when the person adds nothing of their own. */
export const ACTION_MESSAGE: Record<TaskTurnAction, string> = {
  research: "Write the research",
  plan: "Write the plan",
  code: "Build it",
  reply: "",
  summarise: "Summarise so far",
};

/** Of the messages a turn answers, the latest one that asked for something specific decides; else it's a reply. */
export function actionForPending(actions: Array<TaskTurnAction | null>): TaskTurnAction {
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    if (action && action !== "reply") return action;
  }
  return "reply";
}
