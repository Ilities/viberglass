import {
  TICKET_WORKFLOW_PHASE,
  type BuildPullRequest,
  type TaskArtifactKind,
  type TaskTurnAction,
  type Ticket,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { type AgentTurn, AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { TaskMessageDAO } from "../../persistence/ticketing/TaskMessageDAO";
import { TaskSummaryDAO } from "../../persistence/ticketing/TaskSummaryDAO";
import {
  PHASE_DOCUMENT_COMMENT_STATUS,
  TicketPhaseDocumentCommentDAO,
} from "../../persistence/ticketing/TicketPhaseDocumentCommentDAO";
import {
  type PhaseDocumentRevision,
  TicketPhaseDocumentRevisionDAO,
} from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { createBuildPullRequestService } from "../pull-request-reviews/createBuildPullRequestService";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import { AGENT_TURN_ROLE, AGENT_TURN_STATUS } from "../../types/agentSession";
import type { TaskTurnContext, TurnComment, TurnEdit, TurnMessage } from "./taskTurnContext";

/** How much of the thread a cold start reads, newest last; what the latest summary covers is left to it. */
const MESSAGE_LIMIT = 40;

const PHASE_OF: Record<TaskArtifactKind, "research" | "planning"> = { research: "research", plan: "planning" };

interface Dependencies {
  messages: Pick<TaskMessageDAO, "list">;
  turns: Pick<AgentTurnDAO, "listBySession">;
  comments: Pick<TicketPhaseDocumentCommentDAO, "listByTicketAndPhase">;
  revisions: {
    listHandEditsSince(
      ticketId: string,
      since: Date,
    ): Promise<Array<Pick<PhaseDocumentRevision, "phase" | "content" | "actor"> & { authorName: string | null }>>;
  };
  documents: { getOrCreateDocument(ticketId: string, phase: TicketWorkflowPhase): Promise<{ content: string }> };
  summaries: Pick<TaskSummaryDAO, "latest">;
  pullRequest: { forTask(ticket: Pick<Ticket, "id" | "projectId" | "pullRequestUrl">): Promise<Pick<BuildPullRequest, "comments">> };
}

export interface LoadTurnContextInput {
  ticket: Pick<Ticket, "id" | "projectId" | "title" | "description" | "externalTicketId" | "pullRequestUrl">;
  sessionId: string;
  /** The turn being prompted, which doesn't count as the agent's last one. */
  turnId: string;
  action: TaskTurnAction;
  /** What people said in the live session that this turn answers. */
  sessionMessages: AgentTurn[];
}

/** Reads what has happened on a task since its agent's last turn, and what happened before. */
export class TaskTurnContextLoader {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      messages: new TaskMessageDAO(),
      turns: new AgentTurnDAO(),
      comments: new TicketPhaseDocumentCommentDAO(),
      revisions: new TicketPhaseDocumentRevisionDAO(),
      documents: new TicketPhaseDocumentService(),
      summaries: new TaskSummaryDAO(),
      pullRequest: deps.pullRequest ?? createBuildPullRequestService(),
      ...deps,
    };
  }

  async load(input: LoadTurnContextInput): Promise<TaskTurnContext> {
    const { ticket } = input;
    const since = await this.lastPromptedAt(input.sessionId, input.turnId);
    const [threadMessages, comments, research, plan, summary, edits, pullRequest] = await Promise.all([
      this.deps.messages.list(ticket.id),
      this.openComments(ticket.id),
      this.deps.documents.getOrCreateDocument(ticket.id, TICKET_WORKFLOW_PHASE.RESEARCH),
      this.deps.documents.getOrCreateDocument(ticket.id, TICKET_WORKFLOW_PHASE.PLANNING),
      this.deps.summaries.latest(ticket.id),
      since ? this.handEdits(ticket.id, since) : Promise.resolve([]),
      input.action === "code" && ticket.pullRequestUrl ? this.deps.pullRequest.forTask(ticket) : Promise.resolve(null),
    ]);

    const messages: TurnMessage[] = [
      ...threadMessages.map((message) => ({
        author: message.author?.name ?? "Someone",
        body: message.body,
        at: new Date(message.createdAt),
        via: "thread" as const,
      })),
      ...input.sessionMessages.map((turn) => ({
        author: null,
        body: turn.contentMarkdown ?? "",
        at: turn.createdAt,
        via: "session" as const,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const isFresh = (at: Date) => !since || at > since;
    const afterSummary = (at: Date) => !summary || at > summary.createdAt;

    return {
      ticket: {
        title: ticket.title,
        description: ticket.description,
        externalTicketId: ticket.externalTicketId ?? null,
        pullRequestUrl: ticket.pullRequestUrl ?? null,
      },
      documents: { research: research.content.trim(), plan: plan.content.trim() },
      summary: summary?.content.trim() ?? "",
      since,
      earlier: {
        messages: messages.filter((message) => !isFresh(message.at) && afterSummary(message.at)).slice(-MESSAGE_LIMIT),
        openComments: comments.filter((entry) => !isFresh(entry.comment.createdAt)),
      },
      fresh: {
        // Session messages are the ones this turn consumes, whenever they were sent. An agent new to the
        // task (a second one brought in) reads the summary instead of what it covers.
        messages: messages
          .filter((message) => message.via === "session" || (isFresh(message.at) && (since !== null || afterSummary(message.at))))
          .slice(-MESSAGE_LIMIT),
        comments: comments.filter((entry) => isFresh(entry.comment.createdAt)),
        edits,
        pullRequestComments: pullRequest?.comments ?? [],
      },
    };
  }

  /** When the agent last got a prompt it answered: the start of its last finished turn. A failed turn's prompt is sent again. */
  private async lastPromptedAt(sessionId: string, turnId: string): Promise<Date | null> {
    const turns = await this.deps.turns.listBySession(sessionId);
    const answered = turns.filter(
      (turn) =>
        turn.role === AGENT_TURN_ROLE.ASSISTANT &&
        turn.id !== turnId &&
        (turn.status === AGENT_TURN_STATUS.COMPLETED || turn.status === AGENT_TURN_STATUS.BLOCKED),
    );
    return answered.length > 0 ? answered[answered.length - 1].createdAt : null;
  }

  private async openComments(ticketId: string): Promise<TurnComment[]> {
    const lists = await Promise.all(
      (["research", "plan"] as const).map(async (artifact) =>
        (await this.deps.comments.listByTicketAndPhase(ticketId, PHASE_OF[artifact]))
          .filter((comment) => comment.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN)
          .map((comment) => ({ artifact, comment })),
      ),
    );
    return lists.flat().sort((a, b) => a.comment.createdAt.getTime() - b.comment.createdAt.getTime());
  }

  /** The latest hand edit of each document since the agent's last turn. */
  private async handEdits(ticketId: string, since: Date): Promise<TurnEdit[]> {
    const revisions = await this.deps.revisions.listHandEditsSince(ticketId, since);
    const latest = new Map<TaskArtifactKind, TurnEdit>();
    for (const revision of revisions) {
      const artifact: TaskArtifactKind | null =
        revision.phase === "research" ? "research" : revision.phase === "planning" ? "plan" : null;
      if (!artifact) continue;
      latest.set(artifact, { artifact, by: revision.authorName ?? revision.actor ?? "Someone", content: revision.content });
    }
    return [...latest.values()];
  }
}
