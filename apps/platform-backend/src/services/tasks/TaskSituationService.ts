import {
  taskSituation,
  withPlainMentions,
  type HomeThread,
  type SituationViewer,
  type TaskSituation,
  type TaskSituationInput,
  type TaskSituationOutput,
  type Ticket,
} from "@viberglass/types";
import { ArtifactDAO } from "../../persistence/artifacts/ArtifactDAO";
import { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import { TaskMentionDAO } from "../../persistence/ticketing/TaskMentionDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TaskPlanPartMarkDAO } from "../../persistence/ticketing/TaskPlanPartMarkDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TaskThreadFactsDAO } from "../../persistence/ticketing/TaskThreadFactsDAO";
import { TaskThreadListDAO, type ThreadTaskRow } from "../../persistence/ticketing/TaskThreadListDAO";

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
  /** Independent requests addressed to this viewer. */
  attentionRequests: Array<{ source: string; kind: "question" | "mention" | "failure"; questionIds: string[]; questionText: string | null; mentionMessage?: HomeThread["lastMessage"] }>;
  completion: { at: string; kind: "task_done" | "pull_request_merged" } | null;
}

interface Dependencies {
  turns: Pick<TaskTurnFactsDAO, "running" | "paused" | "lastFinished" | "aggregates">;
  thread: Pick<TaskThreadFactsDAO, "latestRevisions" | "lastMessages" | "openQuestions" | "mergedBy" | "completions">;
  mentions: Pick<TaskMentionDAO, "listOpen">;
  participants: Pick<TaskParticipantDAO, "listDrivers">;
  takeovers: Pick<TaskTakeoverDAO, "listFor">;
  pullRequests: Pick<TaskPullRequestDAO, "lastMergedParts">;
  marks: Pick<TaskPlanPartMarkDAO, "listFor">;
  spaces: Pick<TaskThreadListDAO, "backingKinds">;
  artifacts: Pick<ArtifactDAO, "latestForTickets">;
}

const MESSAGE_PREVIEW = 140;

/** The part after `merged` that nobody marked done or skipped. */
function nextUnmarked(merged: number | undefined, marked: Set<number> | undefined): number | null {
  if (merged === undefined) return null;
  let next = merged + 1;
  while (marked?.has(next)) next++;
  return next;
}
const ARTIFACT_OF_PHASE = { planning: "plan", execution: "code" } as const;
const iso = (date: Date) => date.toISOString();

/** The newest of what a task made; on a tie the earlier one listed wins. */
function newestOutput(outputs: Array<TaskSituationOutput | null | undefined>): TaskSituationOutput | null {
  return outputs.reduce<TaskSituationOutput | null>((latest, output) => (output && (!latest || output.at > latest.at) ? output : latest), null);
}
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
      pullRequests: new TaskPullRequestDAO(),
      marks: new TaskPlanPartMarkDAO(),
      spaces: new TaskThreadListDAO(),
      artifacts: new ArtifactDAO(),
      ...deps,
    };
  }

  async describe(tasks: SituationTask[], viewer: SituationViewer): Promise<Map<string, DescribedTask>> {
    const ids = tasks.map((task) => task.id);
    const [running, paused, finished, aggregates, revisions, messages, questions, mentions, drivers, merges, takeovers, partsMerged, marked, backings, made, completions] = await Promise.all([
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
      this.deps.pullRequests.lastMergedParts(ids),
      this.deps.marks.listFor(ids),
      this.deps.spaces.backingKinds(ids),
      this.deps.artifacts.latestForTickets(ids),
      this.deps.thread.completions(ids),
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
        const artifact = made.get(task.id);
        const latestArtifact = newestOutput([
          codeAt && { kind: "code", version: Math.max(1, aggregate?.codeTurns ?? 0), at: iso(codeAt) },
          artifact && { kind: "artifact", title: artifact.title, version: artifact.number, at: iso(artifact.at) },
          revision && { kind: ARTIFACT_OF_PHASE[revision.phase], version: revision.version, at: iso(revision.at) },
        ]);
        const lastMessageAt = newest(message?.at, aggregate?.lastReplyAt);

        const input: TaskSituationInput = {
          status: task.status,
          backing: backings.get(task.id) ?? "git",
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
          partMerged: partsMerged.get(task.id) ?? null,
          nextPart: nextUnmarked(partsMerged.get(task.id), marked.get(task.id)),
        };

        // The agent's latest turn reads as the last message when it came after what people wrote.
        const agentSpokeLast = lastTurn && (!message || lastTurn.at > message.at);
        const lastMessage: HomeThread["lastMessage"] = agentSpokeLast
          ? {
              author: lastTurn.agent,
              text: lastTurn.status === "failed" ? `Stopped: ${lastTurn.failure?.title ?? "the run failed"}.` : (lastTurn.intent ?? "Finished its turn."),
              at: iso(lastTurn.at),
            }
          : message
            ? { author: message.author, text: preview(message.body), at: iso(message.at) }
            : null;
        const latestActivityAt = newest(task.createdAt, message?.at, lastTurn?.at, revision?.at, codeAt, turnRunning?.since) ?? task.createdAt;

        const personalMentions = (mentions.get(task.id) ?? []).filter((mention) => mention.person.id === viewer.id);
        const mentionsYou = personalMentions.length > 0;
        const situation = taskSituation(input, viewer);
        const personalQuestions = (question?.requests ?? []).filter((request) => request.userId === viewer.id || (!request.userId && situation.yourMove));
        const attentionRequests: DescribedTask["attentionRequests"] = situation.state === "done" ? [] : [
          ...personalQuestions.map((request): DescribedTask["attentionRequests"][number] => ({ source: `question:${request.id}`, kind: "question", questionIds: [request.id], questionText: preview(request.text) })),
          ...personalMentions.map((mention): DescribedTask["attentionRequests"][number] => ({ source: `mention:${mention.id}`, kind: "mention", questionIds: [], questionText: null, mentionMessage: mention.message ? { ...mention.message, text: preview(mention.message.text) } : null })),
        ];
        if (situation.yourMove && (situation.state === "failed" || (situation.state === "paused" && situation.requiresAction))) {
          attentionRequests.push({ source: `failure:${situation.since}`, kind: "failure", questionIds: [], questionText: null });
        }
        const done = completions.get(task.id);
        return [task.id, { situation, mentionsYou, lastMessage, latestActivityAt: iso(latestActivityAt), attentionRequests, completion: done ? { at: iso(done.at), kind: done.kind } : null }];
      }),
    );
  }
}
