import { JOB_FAILURE_CODE, type JobFailureCode } from "@viberglass/types";
import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import type { AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import type { TurnResult } from "./TaskTurnOutcomeService";

/** What a turn was asked for: a plan turn's plan, or a build's change to the code. */
export type TurnDeliverable = "plan" | "change";

/** How a turn that came back without its deliverable fails. */
export const MISSING_DELIVERABLE: Record<TurnDeliverable, { failureCode: JobFailureCode; errorMessage: string }> = {
  plan: { failureCode: JOB_FAILURE_CODE.AGENT_NO_DOCUMENT, errorMessage: "The agent finished without writing the plan." },
  change: { failureCode: JOB_FAILURE_CODE.AGENT_NO_CHANGES, errorMessage: "The agent finished without changing any code." },
};

export interface TurnDelivery {
  /** The run's job kind: a build in a Files space runs as a reply, and saves files rather than code. */
  jobKind: string;
  documents: TurnResult["documents"];
  commitHash?: string;
}

/**
 * Whether a turn came back without what it was asked for: a plan turn
 * without the plan, or a build without a commit. A turn that stopped to ask
 * someone a question is waiting, not incomplete.
 */
export class TurnDeliverableCheck {
  constructor(private readonly questions: Pick<AgentQuestionDAO, "hasOpenForTurn"> = new AgentQuestionDAO()) {}

  async missing(turn: Pick<AgentTurn, "id" | "action">, delivery: TurnDelivery): Promise<TurnDeliverable | null> {
    const asked = askedFor(turn, delivery.jobKind);
    if (!asked) return null;
    if (asked === "plan" && delivery.documents?.plan?.trim()) return null;
    if (asked === "change" && delivery.commitHash) return null;
    return (await this.questions.hasOpenForTurn(turn.id)) ? null : asked;
  }
}

function askedFor(turn: Pick<AgentTurn, "action">, jobKind: string): TurnDeliverable | null {
  if (turn.action === "plan") return "plan";
  if (turn.action === "code" && jobKind === "execution") return "change";
  return null;
}
