import type { TaskTurnAction } from "@viberglass/types";
import type { WorkerPayload } from "./types";

/** What a task turn's run knows about its turn, beyond the job: its session, step and branch. */
export interface TurnOptions {
  agentSessionId?: string;
  agentTurnId?: string;
  turnAction?: TaskTurnAction;
  /** A build (or a turn asked for code) may change code; anything else's changes are thrown away. */
  allowCode: boolean;
  coldStartTask?: string;
  compactInstructions?: string;
  acpSessionId?: string;
  conversationStateUrl?: string;
  lastAgentCommit?: string;
  taskBranch?: string;
}

/** The turn's options from its bootstrap payload; a run that isn't a turn only has `allowCode`. */
export function turnOptionsOf(payload: WorkerPayload): TurnOptions {
  return {
    agentSessionId: payload.agentSessionId,
    agentTurnId: payload.agentTurnId,
    turnAction: payload.turnAction,
    allowCode: payload.allowCode ?? payload.jobKind === "execution",
    coldStartTask: payload.coldStartTask,
    compactInstructions: payload.compactInstructions,
    acpSessionId: payload.acpSessionId,
    conversationStateUrl: payload.conversationStateUrl,
    lastAgentCommit: payload.lastAgentCommit ?? undefined,
    taskBranch: payload.taskBranch ?? undefined,
  };
}
