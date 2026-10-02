import type { Thread } from "chat";
import { TICKET_WORKFLOW_PHASE, type TaskTurnProduct } from "@viberglass/types";
import { currentSlackUserId } from "../api/auth/requestActor";
import { AgentQuestionDAO, publicQuestion } from "../persistence/agentSession/AgentQuestionDAO";
import { TaskAgentTurnDAO } from "../persistence/agentSession/TaskAgentTurnDAO";
import { TaskMessageDAO } from "../persistence/ticketing/TaskMessageDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { RecordedActivity } from "../services/notifications/NotificationService";
import type { ActivityListener } from "../services/tasks/activityListeners";
import { TicketPhaseDocumentService } from "../services/TicketPhaseDocumentService";
import { ticketUrl } from "./platformLinks";
import { getThreadForTicket } from "./ticketThreadMap";
import {
  answeredPost,
  documentPost,
  messagePost,
  nextStepCard,
  questionCard,
  replyPost,
  runFailedPost,
  runStartedPost,
} from "./taskMirrorPosts";

type Postable = Parameters<Thread["post"]>[0];

interface Dependencies {
  threads: { forTask(ticketId: string): Promise<Pick<Thread, "post"> | undefined> };
  turns: Pick<TaskAgentTurnDAO, "getByJobId">;
  questions: Pick<AgentQuestionDAO, "getById">;
  messages: Pick<TaskMessageDAO, "getById">;
  documents: Pick<TicketPhaseDocumentService, "getOrCreateDocument">;
  tickets: Pick<TicketDAO, "getSummary">;
  /** Whether the change came from Slack, which shows it already. */
  fromSlack: () => boolean;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const DOCUMENT_STEP = { research: TICKET_WORKFLOW_PHASE.RESEARCH, plan: TICKET_WORKFLOW_PHASE.PLANNING } as const;

/**
 * Keeps a task's Slack thread in step with its thread in Viberglass: what
 * people write there, the agent's turns and what they produced, its questions
 * and their answers. Hears the task's Activity, so whatever starts a change,
 * the web, Slack or a schedule, the thread shows it once.
 */
export class TaskSlackMirror implements ActivityListener {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      threads: { forTask: getThreadForTicket },
      turns: new TaskAgentTurnDAO(),
      questions: new AgentQuestionDAO(),
      messages: new TaskMessageDAO(),
      documents: new TicketPhaseDocumentService(),
      tickets: new TicketDAO(),
      fromSlack: () => currentSlackUserId() !== null,
      ...deps,
    };
  }

  async onActivity(activity: RecordedActivity): Promise<void> {
    const thread = await this.deps.threads.forTask(activity.ticketId);
    if (!thread) return;
    for (const post of await this.postsFor(activity)) await thread.post(post);
  }

  private async postsFor({ ticketId, kind, payload }: RecordedActivity): Promise<Postable[]> {
    const step = text(payload.step) ?? "research";
    switch (kind) {
      case "message_posted": {
        const message = this.deps.fromSlack() ? null : await this.deps.messages.getById(text(payload.messageId) ?? "");
        return message ? [messagePost(message.author?.name ?? "Someone", message.body)] : [];
      }
      case "run_started":
        return [runStartedPost(step)];
      case "run_finished":
        return this.turnPosts(ticketId, text(payload.jobId));
      case "run_failed":
        return [runFailedPost(step, text(payload.reason))];
      case "run_cancelled":
        return [{ markdown: "_The run was cancelled._" }];
      case "question_asked": {
        const question = await this.deps.questions.getById(text(payload.questionId) ?? "");
        return question ? [questionCard(publicQuestion(question))] : [];
      }
      case "question_answered": {
        const question = this.deps.fromSlack() ? null : await this.deps.questions.getById(text(payload.questionId) ?? "");
        const post = question ? answeredPost(publicQuestion(question)) : null;
        return post ? [post] : [];
      }
      case "pull_request_merged":
      case "task_done":
        return [{ markdown: "**Done.**" }];
      default:
        return [];
    }
  }

  /** The agent's reply, the documents it wrote, the pull request, and the next step to ask for. */
  private async turnPosts(ticketId: string, jobId: string | null): Promise<Postable[]> {
    const turn = jobId ? await this.deps.turns.getByJobId(jobId) : null;
    if (!turn?.outcome) return [];
    const task = await this.deps.tickets.getSummary(ticketId);
    const link = task ? ticketUrl(task.spaceSlug, task.key) : null;
    const posts: Postable[] = [replyPost(turn.agent.name, turn.outcome.reply, link)];
    for (const product of turn.outcome.produced) {
      posts.push(...(await this.productPosts(ticketId, product, task?.pullRequestUrl ?? null)));
    }
    const next = nextStepCard(ticketId, turn.outcome.produced);
    if (next) posts.push(next);
    return posts;
  }

  private async productPosts(ticketId: string, product: TaskTurnProduct, pullRequestUrl: string | null): Promise<Postable[]> {
    if (product === "code") return pullRequestUrl ? [{ markdown: `**Pull request:** ${pullRequestUrl}` }] : [];
    if (product === "summary") return [];
    const document = await this.deps.documents.getOrCreateDocument(ticketId, DOCUMENT_STEP[product]);
    return document.content.trim() ? [documentPost(product, document.content, null)] : [];
  }
}
