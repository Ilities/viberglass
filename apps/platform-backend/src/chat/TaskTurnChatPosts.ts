import type { Thread } from "chat";
import { nextWork, TICKET_WORKFLOW_PHASE, type SpaceBackingKind, type TaskTurnOutcome, type TaskTurnProduct } from "@viberglass/types";
import { ArtifactDAO } from "../persistence/artifacts/ArtifactDAO";
import { TaskAgentTurnDAO } from "../persistence/agentSession/TaskAgentTurnDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TaskPartsService } from "../services/tasks/TaskPartsService";
import { TicketPhaseDocumentService } from "../services/TicketPhaseDocumentService";
import { artifactsMarkdown, ticketUrl } from "./platformLinks";
import { documentPost, nextWorkCard, replyPost, savedFilesPost } from "./taskMirrorPosts";

type Postable = Parameters<Thread["post"]>[0];
type TaskSummary = NonNullable<Awaited<ReturnType<TicketDAO["getSummary"]>>>;

/** In an App space, people look at the change and make it live in Viberglass rather than on the code host. */
function codePost(task: TaskSummary, pullRequestUrl: string): Postable {
  if (task.backingKind !== "app") return { markdown: `**Pull request:** ${pullRequestUrl}` };
  const link = ticketUrl(task.spaceSlug, task.key);
  return { markdown: `**The change is ready.** ${link ? `[Look at it and make it live in Viberglass](${link})` : "Look at it and make it live in Viberglass."}` };
}

interface Dependencies {
  turns: Pick<TaskAgentTurnDAO, "getByJobId">;
  documents: Pick<TicketPhaseDocumentService, "getOrCreateDocument">;
  tickets: Pick<TicketDAO, "getSummary">;
  parts: Pick<TaskPartsService, "state">;
  artifacts: Pick<ArtifactDAO, "listForTicket">;
}

/**
 * What a finished turn posts in the task's chat thread: the agent's reply,
 * the plan, pull request, files and artifacts it produced, and the work to
 * ask for next.
 */
export class TaskTurnChatPosts {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      turns: new TaskAgentTurnDAO(),
      documents: new TicketPhaseDocumentService(),
      tickets: new TicketDAO(),
      parts: new TaskPartsService(),
      artifacts: new ArtifactDAO(),
      ...deps,
    };
  }

  async forRun(ticketId: string, jobId: string | null): Promise<Postable[]> {
    const turn = jobId ? await this.deps.turns.getByJobId(jobId) : null;
    if (!turn?.outcome) return [];
    const { outcome } = turn;
    const task = await this.deps.tickets.getSummary(ticketId);
    const posts: Postable[] = [replyPost(turn.agent.name, outcome.reply, task ? ticketUrl(task.spaceSlug, task.key) : null)];
    for (const product of outcome.produced) {
      posts.push(...(await this.productPosts(ticketId, product, task)));
    }
    if (outcome.files) posts.push(savedFilesPost(outcome.files));
    const artifacts = task ? artifactsMarkdown(task.spaceSlug, outcome.artifacts ?? []) : null;
    if (artifacts) posts.push({ markdown: artifacts });
    const next = await this.nextWorkPost(ticketId, task?.backingKind ?? "git", outcome);
    if (next) posts.push(next);
    return posts;
  }

  private async productPosts(ticketId: string, product: TaskTurnProduct, task: TaskSummary | null): Promise<Postable[]> {
    if (product === "code") return task?.pullRequestUrl ? [codePost(task, task.pullRequestUrl)] : [];
    if (product === "summary") return [];
    const document = await this.deps.documents.getOrCreateDocument(ticketId, TICKET_WORKFLOW_PHASE.PLANNING);
    return document.content.trim() ? [documentPost(document.content, null)] : [];
  }

  /** After a plan, the work it leads to; after a Files turn that made an artifact, revising it. A Files task can be marked done from either. */
  private async nextWorkPost(ticketId: string, backing: SpaceBackingKind, outcome: TaskTurnOutcome): Promise<Postable | null> {
    const madeArtifacts = (outcome.artifacts?.length ?? 0) > 0;
    const files = backing === "files";
    if (!outcome.produced.includes("plan") && !(files && madeArtifacts)) return null;
    const offers = nextWork(backing, {
      planParts: files ? null : await this.deps.parts.state({ id: ticketId }),
      hasArtifacts: madeArtifacts || (files && (await this.deps.artifacts.listForTicket(ticketId)).length > 0),
    });
    return offers.length > 0 ? nextWorkCard(ticketId, offers, { markDone: files }) : null;
  }
}
