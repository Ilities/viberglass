import { artifactReviewers, TICKET_WORKFLOW_PHASE, type TaskTurnOutcome, type TaskTurnProduct, type TicketWorkflowPhase } from "@viberglass/types";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentTurn, AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import { TaskMentionDAO } from "../../persistence/ticketing/TaskMentionDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TaskSummaryDAO } from "../../persistence/ticketing/TaskSummaryDAO";
import { PHASE_DOCUMENT_REVISION_SOURCE } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { AGENT_SESSION_EVENT_TYPE } from "../../types/agentSession";
import type { AgentSessionWorkerEventService } from "../agentSession/AgentSessionWorkerEventService";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";

/** What the worker reports a turn produced. */
export interface TurnResult {
  success: boolean;
  documents?: { research?: string; plan?: string; summary?: string };
  codeDiscarded?: boolean;
  resumed?: boolean;
  commitHash?: string;
  contextUsage?: { used: number; size: number | null };
  compacted?: boolean;
}

/** What a recorded turn means for the run's Activity: the step it produced, and whom it mentioned. */
export interface RecordedTurn {
  step: TicketWorkflowPhase;
  mentioned: string[];
}

const INTENT_LIMIT = 200;

/** The artifacts that are a step of the task; a summary is about the conversation, so it mentions nobody. */
const PRODUCT_STEP: Partial<Record<TaskTurnProduct, TicketWorkflowPhase>> = {
  research: TICKET_WORKFLOW_PHASE.RESEARCH,
  plan: TICKET_WORKFLOW_PHASE.PLANNING,
  code: TICKET_WORKFLOW_PHASE.EXECUTION,
};

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
  participants: Pick<TaskParticipantDAO, "list">;
  mentions: Pick<TaskMentionDAO, "createForTurn">;
  summaries: Pick<TaskSummaryDAO, "create">;
}

/**
 * Records what a finished turn produced: each document it wrote as a new
 * version, and its reply and intent on the turn. A turn that produced an
 * artifact mentions the task's reviewers, or its owner, in place of a review
 * request; the mention stays open until they answer. Then ends the turn,
 * which starts the next one if people wrote while it ran.
 */
export class TaskTurnOutcomeService {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "turns" | "workerEvents"> & Partial<Dependencies>) {
    this.deps = {
      events: new AgentSessionEventDAO(),
      documents: new TicketPhaseDocumentService(),
      participants: new TaskParticipantDAO(),
      mentions: new TaskMentionDAO(),
      summaries: new TaskSummaryDAO(),
      ...deps,
    };
  }

  async record(
    jobId: string,
    session: Pick<AgentSession, "ticketId">,
    turn: Pick<AgentTurn, "id" | "action">,
    result: TurnResult,
  ): Promise<RecordedTurn | null> {
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
      // Only a summarise turn writes the summary; an agent tidying SUMMARY.md on its own doesn't make one.
      const summary = result.documents?.summary?.trim();
      if (summary && turn.action === "summarise") {
        await this.deps.summaries.create(session.ticketId, summary, turn.id);
        produced.push("summary");
      }
    }
    const steps = produced.flatMap((product) => PRODUCT_STEP[product] ?? []);

    const reply = (await this.deps.events.listAssistantTextByTurn(turn.id)).join("").trim();
    const mentioned = steps.length > 0 ? await this.reviewersOf(session.ticketId) : [];
    const outcome: TaskTurnOutcome = {
      intent: intentOf(reply),
      reply,
      produced,
      codeDiscarded: result.codeDiscarded ?? false,
      resumed: result.resumed ?? null,
      mentioned,
      contextUsage: result.contextUsage ?? null,
      compacted: result.compacted ?? false,
      commit: result.success ? (result.commitHash ?? null) : null,
    };
    await this.deps.turns.update(turn.id, { contentMarkdown: reply, contentJson: { ...outcome } });
    // Open until each person next posts in the thread, which is what makes it their move.
    await this.deps.mentions.createForTurn(session.ticketId, turn.id, mentioned.map((person) => person.id));

    await this.deps.workerEvents.batchIngest(jobId, [
      {
        eventType: result.success ? AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED : AGENT_SESSION_EVENT_TYPE.TURN_FAILED,
        payload: { produced },
      },
    ]);
    const latest = steps.at(-1);
    return latest ? { step: latest, mentioned: mentioned.map((person) => person.id) } : null;
  }

  private async reviewersOf(ticketId: string): Promise<Array<{ id: string; name: string }>> {
    const participants = await this.deps.participants.list(ticketId);
    return artifactReviewers(participants).flatMap((id) => {
      const person = participants.find((p) => p.userId === id);
      return person ? [{ id, name: person.name }] : [];
    });
  }

  private async saveVersion(ticketId: string, phase: "research" | "planning", content: string, turnId: string): Promise<void> {
    await this.deps.documents.saveDocument(ticketId, phase, content, {
      source: PHASE_DOCUMENT_REVISION_SOURCE.AGENT,
      agentTurnId: turnId,
    });
  }
}
