import { TICKET_WORKFLOW_PHASE, type TaskTurnOutcome, type TaskTurnProduct } from "@viberglass/types";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentTurn, AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import { PHASE_DOCUMENT_REVISION_SOURCE } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { AGENT_SESSION_EVENT_TYPE } from "../../types/agentSession";
import type { AgentSessionWorkerEventService } from "../agentSession/AgentSessionWorkerEventService";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";

/** What the worker reports a turn produced. */
export interface TurnResult {
  success: boolean;
  documents?: { research?: string; plan?: string };
  codeDiscarded?: boolean;
  resumed?: boolean;
  commitHash?: string;
}

const INTENT_LIMIT = 200;

/** The agent's first line, without the markdown it may start with. */
export function intentOf(reply: string): string | null {
  const line = reply
    .split("\n")
    .map((entry) => entry.replace(/^[\s#>*_-]+/, "").replace(/\*\*|__|`/g, "").trim())
    .find((entry) => entry.length > 0);
  if (!line) return null;
  return line.length > INTENT_LIMIT ? `${line.slice(0, INTENT_LIMIT - 1)}…` : line;
}

interface Dependencies {
  turns: Pick<AgentTurnDAO, "update">;
  events: Pick<AgentSessionEventDAO, "listAssistantTextByTurn">;
  documents: Pick<TicketPhaseDocumentService, "saveDocument">;
  workerEvents: Pick<AgentSessionWorkerEventService, "batchIngest">;
}

/**
 * Records what a finished turn produced: each document it wrote as a new
 * version, and its reply and intent on the turn. Then ends the turn, which
 * starts the next one if people wrote while it ran.
 */
export class TaskTurnOutcomeService {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "turns" | "workerEvents"> & Partial<Dependencies>) {
    this.deps = {
      events: new AgentSessionEventDAO(),
      documents: new TicketPhaseDocumentService(),
      ...deps,
    };
  }

  async record(jobId: string, session: Pick<AgentSession, "ticketId">, turn: Pick<AgentTurn, "id">, result: TurnResult): Promise<void> {
    const produced: TaskTurnProduct[] = [];
    if (result.success) {
      const { research, plan } = result.documents ?? {};
      if (research?.trim()) {
        await this.saveVersion(session.ticketId, TICKET_WORKFLOW_PHASE.RESEARCH, research, turn.id);
        produced.push("research");
      }
      if (plan?.trim()) {
        await this.saveVersion(session.ticketId, TICKET_WORKFLOW_PHASE.PLANNING, plan, turn.id);
        produced.push("plan");
      }
      if (result.commitHash) produced.push("code");
    }

    const reply = (await this.deps.events.listAssistantTextByTurn(turn.id)).join("").trim();
    const outcome: TaskTurnOutcome = {
      intent: intentOf(reply),
      reply,
      produced,
      codeDiscarded: result.codeDiscarded ?? false,
      resumed: result.resumed ?? null,
    };
    await this.deps.turns.update(turn.id, { contentMarkdown: reply, contentJson: { ...outcome } });

    await this.deps.workerEvents.batchIngest(jobId, [
      {
        eventType: result.success ? AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED : AGENT_SESSION_EVENT_TYPE.TURN_FAILED,
        payload: { produced },
      },
    ]);
  }

  private async saveVersion(ticketId: string, phase: "research" | "planning", content: string, turnId: string): Promise<void> {
    await this.deps.documents.saveDocument(ticketId, phase, content, {
      source: PHASE_DOCUMENT_REVISION_SOURCE.AGENT,
      agentTurnId: turnId,
    });
  }
}
