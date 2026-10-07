import { ACTIVITY_SHOWN_ELSEWHERE_IN_THREAD, type TaskArtifactKind, type TaskTimelineEntry } from "@viberglass/types";
import { AgentQuestionDAO, publicQuestion } from "../../persistence/agentSession/AgentQuestionDAO";
import { TaskAgentTurnDAO } from "../../persistence/agentSession/TaskAgentTurnDAO";
import { TaskSessionMessageDAO } from "../../persistence/agentSession/TaskSessionMessageDAO";
import { TaskActivityDAO } from "../../persistence/ticketing/TaskActivityDAO";
import { TaskMessageDAO } from "../../persistence/ticketing/TaskMessageDAO";
import { TaskSummaryDAO } from "../../persistence/ticketing/TaskSummaryDAO";
import { TicketPhaseDocumentRevisionDAO } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";

interface Dependencies {
  messages: Pick<TaskMessageDAO, "list">;
  sessionMessages: Pick<TaskSessionMessageDAO, "listForTask">;
  agentTurns: Pick<TaskAgentTurnDAO, "listForTask">;
  revisions: Pick<TicketPhaseDocumentRevisionDAO, "listByTicketWithAuthors">;
  activity: Pick<TaskActivityDAO, "list">;
  summaries: Pick<TaskSummaryDAO, "listForTask">;
  questions: Pick<AgentQuestionDAO, "listForTask" | "questionsAnsweredBy">;
}

const ARTIFACT_OF_PHASE: Record<string, TaskArtifactKind | undefined> = { planning: "plan" };

/** When two entries share a moment, a message reads before what it caused. */
const ORDER_AT_SAME_TIME: Record<TaskTimelineEntry["kind"], number> = {
  message: 0,
  agent_turn: 1,
  question: 2,
  artifact_version: 3,
  summary: 4,
  event: 5,
};

/** A turn's entry says how its run went, so the run's own events would repeat it. Who cancelled it is still news. */
const RUN_EVENTS_SHOWN_BY_TURN = new Set(["run_started", "run_finished", "run_failed"]);

/** A task's one thread: what people said, the agent's turns and questions, each document version and summary, and what happened, in order. */
export class TaskTimelineService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      messages: new TaskMessageDAO(),
      sessionMessages: new TaskSessionMessageDAO(),
      agentTurns: new TaskAgentTurnDAO(),
      revisions: new TicketPhaseDocumentRevisionDAO(),
      activity: new TaskActivityDAO(),
      summaries: new TaskSummaryDAO(),
      questions: new AgentQuestionDAO(),
      ...deps,
    };
  }

  async list(ticketId: string): Promise<TaskTimelineEntry[]> {
    const [messages, sessionMessages, agentTurns, revisions, activity, summaries, questions, answers] = await Promise.all([
      this.deps.messages.list(ticketId),
      this.deps.sessionMessages.listForTask(ticketId),
      this.deps.agentTurns.listForTask(ticketId),
      this.deps.revisions.listByTicketWithAuthors(ticketId),
      this.deps.activity.list(ticketId),
      this.deps.summaries.listForTask(ticketId),
      this.deps.questions.listForTask(ticketId),
      this.deps.questions.questionsAnsweredBy(ticketId),
    ]);

    const turnJobs = new Set(agentTurns.flatMap((turn) => (turn.jobId ? [turn.jobId] : [])));
    const shownByTurn = (entry: (typeof activity)[number]) =>
      RUN_EVENTS_SHOWN_BY_TURN.has(entry.kind) && typeof entry.payload.jobId === "string" && turnJobs.has(entry.payload.jobId);

    const entries: TaskTimelineEntry[] = [
      // An answer shows under its question, so its message isn't repeated.
      ...messages.filter((message) => !answers.has(message.id)).map((message): TaskTimelineEntry => ({
        kind: "message",
        id: message.id,
        at: message.createdAt,
        author: message.author,
        body: message.body,
        channel: "thread",
        sessionId: null,
      })),
      ...sessionMessages.map((message): TaskTimelineEntry => ({
        kind: "message",
        id: message.id,
        at: message.createdAt.toISOString(),
        author: message.author,
        body: message.body,
        channel: "session",
        sessionId: message.sessionId,
      })),
      ...agentTurns.map((turn): TaskTimelineEntry => ({
        kind: "agent_turn",
        id: turn.id,
        at: turn.createdAt.toISOString(),
        agent: turn.agent,
        action: turn.action,
        status: turn.status,
        outcome: turn.outcome,
        sessionId: turn.sessionId,
        jobId: turn.jobId,
      })),
      ...questions.map((record): TaskTimelineEntry => ({ kind: "question", id: record.id, at: record.askedAt, question: publicQuestion(record) })),
      ...this.versions(revisions),
      ...summaries.map((summary): TaskTimelineEntry => ({
        kind: "summary",
        id: summary.id,
        at: summary.createdAt.toISOString(),
        version: summary.version,
        content: summary.content,
      })),
      ...activity
        .filter((entry) => !ACTIVITY_SHOWN_ELSEWHERE_IN_THREAD.has(entry.kind) && !shownByTurn(entry))
        .map((entry): TaskTimelineEntry => ({ kind: "event", id: entry.id, at: entry.createdAt, activity: entry })),
    ];
    return entries.sort((a, b) => a.at.localeCompare(b.at) || ORDER_AT_SAME_TIME[a.kind] - ORDER_AT_SAME_TIME[b.kind]);
  }

  private versions(revisions: Awaited<ReturnType<Dependencies["revisions"]["listByTicketWithAuthors"]>>): TaskTimelineEntry[] {
    return revisions.flatMap((revision): TaskTimelineEntry[] => {
      const artifact = ARTIFACT_OF_PHASE[revision.phase];
      if (!artifact) return [];
      const version = revision.version;
      const byAgent = revision.source === "agent";
      return [
        {
          kind: "artifact_version",
          id: revision.id,
          at: revision.createdAt.toISOString(),
          artifact,
          version,
          author: !byAgent && revision.authorId && revision.authorName ? { id: revision.authorId, name: revision.authorName } : null,
          byAgent,
        },
      ];
    });
  }
}
