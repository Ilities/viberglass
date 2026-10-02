import type { TaskTurnAction } from "@viberglass/types";
import type { WorkerPayload } from "./types";

/** What a task turn's run knows about its turn, beyond the job: its session, step and branch. */
export interface TurnOptions {
  agentSessionId?: string;
  agentTurnId?: string;
  turnAction?: TaskTurnAction;
  /** A turn asked for code may change it; any other turn's changes are thrown away. */
  allowCode: boolean;
  coldStartTask?: string;
  compactInstructions?: string;
  acpSessionId?: string;
  conversationStateUrl?: string;
  lastAgentCommit?: string;
  taskBranch?: string;
}

/** The turn's options from its bootstrap payload; a scheduled job has none of them. */
export function turnOptionsOf(payload: WorkerPayload): TurnOptions {
  return {
    agentSessionId: payload.agentSessionId,
    agentTurnId: payload.agentTurnId,
    turnAction: payload.turnAction,
    allowCode: payload.allowCode ?? false,
    coldStartTask: payload.coldStartTask,
    compactInstructions: payload.compactInstructions,
    acpSessionId: payload.acpSessionId,
    conversationStateUrl: payload.conversationStateUrl,
    lastAgentCommit: payload.lastAgentCommit ?? undefined,
    taskBranch: payload.taskBranch ?? undefined,
  };
}
