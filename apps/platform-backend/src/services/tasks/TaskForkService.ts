import { NATIVE_TICKET_ORIGIN, TICKET_WORKFLOW_PHASE, type Ticket } from "@viberglass/types";
import type { TaskSessionMessageDAO } from "../../persistence/agentSession/TaskSessionMessageDAO";
import type { TaskForkDAO } from "../../persistence/ticketing/TaskForkDAO";
import type { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import type { TaskSummaryDAO } from "../../persistence/ticketing/TaskSummaryDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { PHASE_DOCUMENT_REVISION_SOURCE } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import type { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";

interface Dependencies {
  tickets: Pick<TicketDAO, "createTicket">;
  forks: Pick<TaskForkDAO, "copyThread" | "addMessages" | "planAt" | "summaryAt">;
  sessionMessages: Pick<TaskSessionMessageDAO, "listForTask">;
  participants: Pick<TaskParticipantDAO, "list">;
  documents: Pick<TicketPhaseDocumentService, "saveDocument">;
  summaries: Pick<TaskSummaryDAO, "create">;
}

/**
 * Forks a task as it was at `at` into a new task in the same space: what
 * people wrote in the thread, or said to an agent in a live session, which
 * the fork's thread shows as messages, the plan and the summary of then, its owner,
 * reviewers and watchers. The agents' own turns stay with the original, so
 * every runner on a fork starts from the same written record. A fork is a
 * native task, so nothing on it goes back to the tracker the original came from.
 */
export class TaskForkService {
  constructor(private readonly deps: Dependencies) {}

  async fork(original: Ticket, at: Date, title: string, actorId: string): Promise<Ticket> {
    const owner = (await this.deps.participants.list(original.id)).find((participant) => participant.role === "owner");
    const fork = await this.deps.tickets.createTicket({
      projectId: original.projectId,
      title,
      description: original.description,
      severity: original.severity,
      category: original.category,
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
      ticketSystem: NATIVE_TICKET_ORIGIN,
      requesterId: actorId,
      ...(owner ? { ownerId: owner.userId } : {}),
    });

    await this.deps.forks.copyThread(original.id, fork.id, at);
    const spoken = (await this.deps.sessionMessages.listForTask(original.id)).filter((message) => message.createdAt <= at);
    await this.deps.forks.addMessages(
      fork.id,
      spoken.map((message) => ({ authorId: message.author?.id ?? null, body: message.body, at: message.createdAt })),
    );
    const [plan, summary] = await Promise.all([this.deps.forks.planAt(original.id, at), this.deps.forks.summaryAt(original.id, at)]);
    if (plan?.trim()) {
      await this.deps.documents.saveDocument(fork.id, TICKET_WORKFLOW_PHASE.PLANNING, plan, { source: PHASE_DOCUMENT_REVISION_SOURCE.AGENT });
    }
    if (summary?.trim()) await this.deps.summaries.create(fork.id, summary, null);
    return fork;
  }
}
