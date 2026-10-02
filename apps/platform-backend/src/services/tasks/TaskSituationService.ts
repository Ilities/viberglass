import {
  taskSituation,
  withPlainMentions,
  type HomeThread,
  type SituationViewer,
  type TaskSituation,
  type TaskSituationInput,
  type Ticket,
} from "@viberglass/types";
import { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import { TaskMentionDAO } from "../../persistence/ticketing/TaskMentionDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TaskThreadFactsDAO } from "../../persistence/ticketing/TaskThreadFactsDAO";
import type { ThreadTaskRow } from "../../persistence/ticketing/TaskThreadListDAO";

export type SituationTask = Pick<ThreadTaskRow, "id" | "status" | "pullRequestUrl" | "createdAt" | "updatedAt">;

/** A task as the API returns it, in the shape the situation is worked out from. */
export function situationTaskOf(ticket: Pick<Ticket, "id" | "status" | "pullRequestUrl" | "createdAt" | "updatedAt">): SituationTask {
  return {
    id: ticket.id,
    status: ticket.status,
    pullRequestUrl: ticket.pullRequestUrl ?? null,
    createdAt: new Date(ticket.createdAt),
    updatedAt: new Date(ticket.updatedAt),
  };
}

export interface DescribedTask {
  situation: TaskSituation;
  /** Whether the viewer has a mention there they haven't answered. */
  mentionsYou: boolean;
  lastMessage: HomeThread["lastMessage"];
  latestActivityAt: string;
}

interface Dependencies {
  turns: Pick<TaskTurnFactsDAO, "running" | "paused" | "lastFinished" | "aggregates">;
  thread: Pick<TaskThreadFactsDAO, "latestRevisions" | "lastMessages" | "openQuestions" | "mergedBy">;
  mentions: Pick<TaskMentionDAO, "listOpen">;
  participants: Pick<TaskParticipantDAO, "listDrivers">;
  takeovers: Pick<TaskTakeoverDAO, "listFor">;
}

const MESSAGE_PREVIEW = 140;
const ARTIFACT_OF_PHASE = { research: "research", planning: "plan", execution: "code" } as const;
const iso = (date: Date) => date.toISOString();
const newest = (...dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | null>((latest, date) => (date && (!latest || date > latest) ? date : latest), null);

function preview(body: string): string {
  const text = withPlainMentions(body).replace(/\s+/g, " ").trim();
  return text.length > MESSAGE_PREVIEW ? `${text.slice(0, MESSAGE_PREVIEW - 1)}…` : text;
}

/**
 * Works out where many tasks stand and whose move each is, with
 * one query per fact for the whole list, so Home, task lists and the task page
 * say the same thing.
 */
export class TaskSituationService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      turns: new TaskTurnFactsDAO(),
      thread: new TaskThreadFactsDAO(),
      mentions: new TaskMentionDAO(),
      participants: new TaskParticipantDAO(),
      takeovers: new TaskTakeoverDAO(),
      ...deps,
    };
  }

  async describe(tasks: SituationTask[], viewer: SituationViewer): Promise<Map<string, DescribedTask>> {
    const ids = tasks.map((task) => task.id);
    const [running, paused, finished, aggregates, revisions, messages, questions, mentions, drivers, merges, takeovers] = await Promise.all([
      this.deps.turns.running(ids),
      this.deps.turns.paused(ids),
      this.deps.turns.lastFinished(ids),
      this.deps.turns.aggregates(ids),
      this.deps.thread.latestRevisions(ids),
      this.deps.thread.lastMessages(ids),
      this.deps.thread.openQuestions(ids),
      this.deps.mentions.listOpen(ids),
      this.deps.participants.listDrivers(ids),
      this.deps.thread.mergedBy(ids),
      this.deps.takeovers.listFor(ids),
    ]);

    return new Map(
      tasks.map((task) => {
        const lastTurn = finished.get(task.id);
        const aggregate = aggregates.get(task.id);
        const revision = revisions.get(task.id);
        const message = messages.get(task.id);
        const question = questions.get(task.id);
        const turnRunning = running.get(task.id);

        const codeAt = task.pullRequestUrl ? (aggregate?.lastCodeAt ?? task.updatedAt) : null;
        const latestArtifact: TaskSituationInput["latestArtifact"] =
          codeAt && (!revision || codeAt >= revision.at)
            ? { kind: "code", version: Math.max(1, aggregate?.codeTurns ?? 0), at: iso(codeAt) }
            : revision
              ? { kind: ARTIFACT_OF_PHASE[revision.phase], version: revision.version, at: iso(revision.at) }
              : null;
        const lastMessageAt = newest(message?.at, aggregate?.lastReplyAt);

        const input: TaskSituationInput = {
          status: task.status,
          createdAt: iso(task.createdAt),
          owner: drivers.get(task.id) ?? null,
          latestArtifact,
          runningTurn: turnRunning ? { action: turnRunning.action, since: iso(turnRunning.since) } : null,
          pausedSince: paused.has(task.id) ? iso(paused.get(task.id) ?? task.updatedAt) : null,
          takenOver: takeovers.get(task.id) ?? null,
          lastTurn: lastTurn ? { status: lastTurn.status, at: iso(lastTurn.at), failure: lastTurn.failure } : null,
          openQuestion: question ? { askedOf: question.askedOf, since: iso(question.since) } : null,
          openMentions: mentions.get(task.id) ?? [],
          lastMessageAt: lastMessageAt ? iso(lastMessageAt) : null,
          mergedBy: merges.get(task.id) ?? null,
        };

        // The agent's latest turn reads as the last message when it came after what people wrote.
        const agentSpokeLast = lastTurn && (!message || lastTurn.at > message.at);
        const lastMessage: HomeThread["lastMessage"] = agentSpokeLast
          ? { author: lastTurn.agent, text: lastTurn.intent ?? (lastTurn.status === "failed" ? "The run failed" : "Finished its turn"), at: iso(lastTurn.at) }
          : message
            ? { author: message.author, text: preview(message.body), at: iso(message.at) }
            : null;
        const latestActivityAt = newest(task.createdAt, message?.at, lastTurn?.at, revision?.at, codeAt, turnRunning?.since) ?? task.createdAt;

        const mentionsYou = input.openMentions.some((mention) => mention.person.id === viewer.id);
        return [task.id, { situation: taskSituation(input, viewer), mentionsYou, lastMessage, latestActivityAt: iso(latestActivityAt) }];
      }),
    );
  }
}
