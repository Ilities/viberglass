import type { TaskTurnAction } from "@viberglass/types";
import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import type { AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import type { TurnResult } from "./TaskTurnOutcomeService";

type DocumentAction = Extract<TaskTurnAction, "research" | "plan">;

const DOCUMENT_ACTIONS = new Set<TaskTurnAction>(["research", "plan"]);

function isDocumentAction(action: TaskTurnAction): action is DocumentAction {
  return DOCUMENT_ACTIONS.has(action);
}

/**
 * Whether a turn asked for a document came back without it. A turn that
 * stopped to ask someone a question is waiting, not incomplete.
 */
export class TurnDocumentCheck {
  constructor(private readonly questions: Pick<AgentQuestionDAO, "hasOpenForTurn"> = new AgentQuestionDAO()) {}

  async missing(turn: Pick<AgentTurn, "id" | "action">, documents: TurnResult["documents"]): Promise<DocumentAction | null> {
    const action = turn.action;
    if (!action || !isDocumentAction(action)) return null;
    if (documents?.[action]?.trim()) return null;
    return (await this.questions.hasOpenForTurn(turn.id)) ? null : action;
  }
}
