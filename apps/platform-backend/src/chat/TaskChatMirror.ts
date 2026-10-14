import type { Thread } from "chat";
import { buildWork, isTaskTurnAction, turnRunLabel, type TaskTurnAction, type TurnRunLabel } from "@viberglass/types";
import { currentChatActor } from "../api/auth/requestActor";
import { AgentQuestionDAO, publicQuestion } from "../persistence/agentSession/AgentQuestionDAO";
import { TaskAgentTurnDAO } from "../persistence/agentSession/TaskAgentTurnDAO";
import { TaskMessageDAO } from "../persistence/ticketing/TaskMessageDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { RecordedActivity } from "../services/notifications/NotificationService";
import type { ActivityListener } from "../services/tasks/activityListeners";
import { TaskPartsService } from "../services/tasks/TaskPartsService";
import { getThreadForTicket } from "./ticketThreadMap";
import { TaskTurnChatPosts } from "./TaskTurnChatPosts";
import {
  answeredPost,
  messagePost,
  nextWorkCard,
  partMergedPost,
  questionCard,
  runFailedPost,
  runStartedPost,
} from "./taskMirrorPosts";

type Postable = Parameters<Thread["post"]>[0];

interface Dependencies {
  threads: { forTask(ticketId: string): Promise<Pick<Thread, "post"> | undefined> };
  turns: Pick<TaskAgentTurnDAO, "getByJobId">;
  questions: Pick<AgentQuestionDAO, "getById">;
  messages: Pick<TaskMessageDAO, "getById">;
  tickets: Pick<TicketDAO, "getSummary">;
  parts: Pick<TaskPartsService, "state">;
  turnPosts: Pick<TaskTurnChatPosts, "forRun">;
  /** Whether the change came from chat, which shows it already. */
  fromChat: () => boolean;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * Keeps a task's chat thread in step with its thread in Viberglass: what
 * people write there, the agent's turns and what they produced, its questions
 * and their answers. Hears the task's Activity, so whatever starts a change,
 * the web, chat or a schedule, the thread shows it once.
 */
export class TaskChatMirror implements ActivityListener {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      threads: { forTask: getThreadForTicket },
      turns: new TaskAgentTurnDAO(),
      questions: new AgentQuestionDAO(),
      messages: new TaskMessageDAO(),
      tickets: new TicketDAO(),
      parts: new TaskPartsService(),
      turnPosts: new TaskTurnChatPosts(),
      fromChat: () => currentChatActor() !== null,
      ...deps,
    };
  }

  async onActivity(activity: RecordedActivity): Promise<void> {
    const thread = await this.deps.threads.forTask(activity.ticketId);
    if (!thread) return;
    for (const post of await this.postsFor(activity)) await thread.post(post);
  }

  private async postsFor({ ticketId, kind, payload }: RecordedActivity): Promise<Postable[]> {
    switch (kind) {
      case "message_posted": {
        const message = this.deps.fromChat() ? null : await this.deps.messages.getById(text(payload.messageId) ?? "");
        return message ? [messagePost(message.author?.name ?? message.externalAuthor?.name ?? "Someone", message.body)] : [];
      }
      case "run_started":
        return [runStartedPost(await this.runLabel(ticketId, isTaskTurnAction(payload.action) ? payload.action : null))];
      case "run_finished":
        return this.deps.turnPosts.forRun(ticketId, text(payload.jobId));
      case "run_failed": {
        const jobId = text(payload.jobId);
        const turn = jobId ? await this.deps.turns.getByJobId(jobId) : null;
        return [runFailedPost(await this.runLabel(ticketId, turn?.action ?? null), text(payload.reason))];
      }
      case "run_cancelled":
        return [{ markdown: "_The run was cancelled._" }];
      case "question_asked": {
        const question = await this.deps.questions.getById(text(payload.questionId) ?? "");
        return question ? [questionCard(publicQuestion(question))] : [];
      }
      case "question_answered": {
        const question = this.deps.fromChat() ? null : await this.deps.questions.getById(text(payload.questionId) ?? "");
        const post = question ? answeredPost(publicQuestion(question)) : null;
        return post ? [post] : [];
      }
      case "pull_request_merged":
      case "task_done":
        return [{ markdown: "**Done.**" }];
      case "part_merged": {
        const merged = Array.isArray(payload.parts) ? payload.parts.filter((part): part is number => typeof part === "number") : [];
        const builds = buildWork(await this.deps.parts.state({ id: ticketId }));
        const next = builds.length > 0 ? [nextWorkCard(ticketId, builds, { intro: "Mention me to ask for something else, or:" })] : [];
        return [partMergedPost(merged, text(payload.mergedBy)), ...next];
      }
      default:
        return [];
    }
  }

  /** What the run does, from what was asked and the space; null for a run that isn't a task's turn. */
  private async runLabel(ticketId: string, action: TaskTurnAction | null): Promise<TurnRunLabel | null> {
    if (!action) return null;
    const task = await this.deps.tickets.getSummary(ticketId);
    return turnRunLabel(action, task?.backingKind ?? "git");
  }
}
