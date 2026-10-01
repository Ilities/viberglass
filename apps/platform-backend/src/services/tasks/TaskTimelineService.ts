import { ACTIVITY_SHOWN_ELSEWHERE_IN_THREAD, type TaskArtifactKind, type TaskTimelineEntry } from "@viberglass/types";
import { TaskSessionMessageDAO } from "../../persistence/agentSession/TaskSessionMessageDAO";
import { TaskActivityDAO } from "../../persistence/ticketing/TaskActivityDAO";
import { TaskMessageDAO } from "../../persistence/ticketing/TaskMessageDAO";
import { TicketPhaseDocumentRevisionDAO } from "../../persistence/ticketing/TicketPhaseDocumentRevisionDAO";

interface Dependencies {
  messages: Pick<TaskMessageDAO, "list">;
  sessionMessages: Pick<TaskSessionMessageDAO, "listForTask">;
  revisions: Pick<TicketPhaseDocumentRevisionDAO, "listByTicketWithAuthors">;
  activity: Pick<TaskActivityDAO, "list">;
}

const ARTIFACT_OF_PHASE: Record<string, TaskArtifactKind | undefined> = { research: "research", planning: "plan" };

/** When two entries share a moment, a message reads before what it caused. */
const ORDER_AT_SAME_TIME: Record<TaskTimelineEntry["kind"], number> = { message: 0, artifact_version: 1, event: 2 };

/** A task's one thread (ADR 0008): what people said, each document version, and what happened, in order. */
export class TaskTimelineService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      messages: new TaskMessageDAO(),
      sessionMessages: new TaskSessionMessageDAO(),
      revisions: new TicketPhaseDocumentRevisionDAO(),
      activity: new TaskActivityDAO(),
      ...deps,
    };
  }

  async list(ticketId: string): Promise<TaskTimelineEntry[]> {
    const [messages, sessionMessages, revisions, activity] = await Promise.all([
      this.deps.messages.list(ticketId),
      this.deps.sessionMessages.listForTask(ticketId),
      this.deps.revisions.listByTicketWithAuthors(ticketId),
      this.deps.activity.list(ticketId),
    ]);

    const entries: TaskTimelineEntry[] = [
      ...messages.map((message): TaskTimelineEntry => ({
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
      ...this.versions(revisions),
      ...activity
        .filter((entry) => !ACTIVITY_SHOWN_ELSEWHERE_IN_THREAD.has(entry.kind))
        .map((entry): TaskTimelineEntry => ({ kind: "event", id: entry.id, at: entry.createdAt, activity: entry })),
    ];
    return entries.sort((a, b) => a.at.localeCompare(b.at) || ORDER_AT_SAME_TIME[a.kind] - ORDER_AT_SAME_TIME[b.kind]);
  }

  /** Numbers each document's revisions from 1, in the order they were saved. */
  private versions(revisions: Awaited<ReturnType<Dependencies["revisions"]["listByTicketWithAuthors"]>>): TaskTimelineEntry[] {
    const counts = new Map<TaskArtifactKind, number>();
    return revisions.flatMap((revision): TaskTimelineEntry[] => {
      const artifact = ARTIFACT_OF_PHASE[revision.phase];
      if (!artifact) return [];
      const version = (counts.get(artifact) ?? 0) + 1;
      counts.set(artifact, version);
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
