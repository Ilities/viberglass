import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import type { AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import type { TurnResult } from "./TaskTurnOutcomeService";

/**
 * Whether a turn asked for a document came back without it. A turn that
 * stopped to ask someone a question is waiting, not incomplete.
 */
export class TurnDocumentCheck {
  constructor(private readonly questions: Pick<AgentQuestionDAO, "hasOpenForTurn"> = new AgentQuestionDAO()) {}

  async missing(turn: Pick<AgentTurn, "id" | "action">, documents: TurnResult["documents"]): Promise<"plan" | null> {
    const action = turn.action;
    if (action !== "plan") return null;
    if (documents?.plan?.trim()) return null;
    return (await this.questions.hasOpenForTurn(turn.id)) ? null : "plan";
  }
}
