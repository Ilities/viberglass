import { TICKET_WORKFLOW_PHASE, type TaskTurnProduct } from "@viberglass/types";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { PHASE_DOCUMENT_REVISION_SOURCE } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { AGENT_TURN_STATUS } from "../../types/agentSession";
import { AGENT_SESSION_SERVICE_ERROR_CODE, AgentSessionServiceError } from "../errors/AgentSessionServiceError";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import { documentsAskedFor } from "./documentsAskedFor";

export interface PartialWork {
  documents: { research?: string; plan?: string };
  commitHash?: string;
}

interface Dependencies {
  turns: Pick<AgentTurnDAO, "getByJobId" | "update">;
  sessions: Pick<AgentSessionDAO, "getById">;
  documents: Pick<TicketPhaseDocumentService, "saveDocument">;
}

/**
 * Keeps what a stopped turn had done: each document it had written becomes a
 * version, and its work-in-progress commit is on the task's branch. The turn
 * stays cancelled; the thread says it stopped partway and what it kept.
 */
export class PartialTurnService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      turns: new AgentTurnDAO(),
      sessions: new AgentSessionDAO(),
      documents: new TicketPhaseDocumentService(),
      ...deps,
    };
  }

  async keep(jobId: string, work: PartialWork): Promise<TaskTurnProduct[]> {
    const turn = await this.deps.turns.getByJobId(jobId);
    const session = turn ? await this.deps.sessions.getById(turn.sessionId) : null;
    // Only a stopped turn keeps partial work; a finished one reports through its result.
    if (!turn || !session || turn.status !== AGENT_TURN_STATUS.CANCELLED) {
      throw new AgentSessionServiceError(AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND, "No stopped turn for this run", 404);
    }
    const kept: TaskTurnProduct[] = [];
    for (const [product, phase] of [
      ["research", TICKET_WORKFLOW_PHASE.RESEARCH],
      ["plan", TICKET_WORKFLOW_PHASE.PLANNING],
    ] as const) {
      const content = documentsAskedFor(turn.action).includes(product) ? work.documents[product]?.trim() : undefined;
      if (!content) continue;
      await this.deps.documents.saveDocument(session.ticketId, phase, content, { source: PHASE_DOCUMENT_REVISION_SOURCE.AGENT, agentTurnId: turn.id });
      kept.push(product);
    }
    if (work.commitHash) kept.push("code");
    await this.deps.turns.update(turn.id, {
      contentJson: {
        intent: "Stopped partway",
        reply: "",
        produced: kept,
        codeDiscarded: false,
        resumed: null,
        commit: work.commitHash ?? null,
        stoppedPartway: true,
      },
    });
    return kept;
  }
}
