import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { withViberglassMark } from "@viberglass/integration-core";
import { ticketUrl } from "../../chat/platformLinks";
import { createChildLogger } from "../../config/logger";
import { AgentQuestionDAO, publicQuestion } from "../../persistence/agentSession/AgentQuestionDAO";
import { TaskAgentTurnDAO } from "../../persistence/agentSession/TaskAgentTurnDAO";
import { TaskIssueLinkDAO, type TaskIssueLink } from "../../persistence/ticketing/TaskIssueLinkDAO";
import { TaskMessageDAO } from "../../persistence/ticketing/TaskMessageDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { RecordedActivity } from "../notifications/NotificationService";
import type { ActivityListener } from "../tasks/activityListeners";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import { TrackerCommenterResolver } from "./TrackerCommenterResolver";
import { DONE_POST, partMergedPost, planReadyPost, pullRequestPost, questionPost, replyPost } from "./trackerMirrorPosts";

const logger = createChildLogger({ service: "TaskIssueMirror" });

interface Dependencies {
  links: Pick<TaskIssueLinkDAO, "getByTicket">;
  commenters: Pick<TrackerCommenterResolver, "resolve">;
  turns: Pick<TaskAgentTurnDAO, "getByJobId">;
  messages: Pick<TaskMessageDAO, "sourcesAnsweredBy">;
  questions: Pick<AgentQuestionDAO, "getById">;
  documents: Pick<TicketPhaseDocumentService, "getOrCreateDocument">;
  tickets: Pick<TicketDAO, "getSummary">;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * Posts a task's milestones to the tracker issue it's linked to: the plan,
 * the agent's questions, the pull request and done. The agent's reply goes
 * too when it was asked from the issue. Hears the task's Activity, like the
 * Slack mirror, so it doesn't matter where a change started.
 */
export class TaskIssueMirror implements ActivityListener {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      links: new TaskIssueLinkDAO(),
      commenters: new TrackerCommenterResolver(),
      turns: new TaskAgentTurnDAO(),
      messages: new TaskMessageDAO(),
      questions: new AgentQuestionDAO(),
      documents: new TicketPhaseDocumentService(),
      tickets: new TicketDAO(),
      ...deps,
    };
  }

  async onActivity(activity: RecordedActivity): Promise<void> {
    const link = await this.deps.links.getByTicket(activity.ticketId);
    if (!link) return;
    const posts = await this.postsFor(activity, link);
    if (posts.length === 0) return;
    const commenter = await this.deps.commenters.resolve(link);
    if (!commenter) {
      logger.warn("A linked issue's connection can't post comments", { ticketId: activity.ticketId, provider: link.provider });
      return;
    }
    const issue = { key: link.issueKey, url: link.issueUrl, apiBaseUrl: link.apiBaseUrl };
    for (const post of posts) await commenter.postComment(issue, withViberglassMark(post));
  }

  private async postsFor({ ticketId, kind, payload }: RecordedActivity, link: TaskIssueLink): Promise<string[]> {
    switch (kind) {
      case "run_finished":
        return this.turnPosts(ticketId, text(payload.jobId), link);
      case "question_asked": {
        const question = await this.deps.questions.getById(text(payload.questionId) ?? "");
        return question ? [questionPost(publicQuestion(question), await this.taskLink(ticketId))] : [];
      }
      case "part_merged": {
        const parts = Array.isArray(payload.parts) ? payload.parts.filter((part): part is number => typeof part === "number") : [];
        return parts.length > 0 ? [partMergedPost(parts)] : [];
      }
      case "pull_request_merged":
      case "task_done":
        return [DONE_POST];
      default:
        return [];
    }
  }

  /** The agent's reply when it was asked from the issue, then the plan it wrote or the pull request it opened. */
  private async turnPosts(ticketId: string, jobId: string | null, link: TaskIssueLink): Promise<string[]> {
    const turn = jobId ? await this.deps.turns.getByJobId(jobId) : null;
    if (!turn?.outcome) return [];
    const taskLink = await this.taskLink(ticketId);
    const posts: string[] = [];
    const askedFromIssue = (await this.deps.messages.sourcesAnsweredBy(turn.id)).includes(link.provider);
    if (askedFromIssue) posts.push(replyPost(turn.agent.name, turn.outcome.reply, taskLink));
    if (turn.outcome.produced.includes("plan")) {
      const plan = await this.deps.documents.getOrCreateDocument(ticketId, TICKET_WORKFLOW_PHASE.PLANNING);
      posts.push(planReadyPost(plan.content, taskLink));
    }
    if (turn.outcome.produced.includes("code")) {
      const pullRequestUrl = (await this.deps.tickets.getSummary(ticketId))?.pullRequestUrl;
      if (pullRequestUrl) posts.push(pullRequestPost(pullRequestUrl));
    }
    return posts;
  }

  private async taskLink(ticketId: string): Promise<string | null> {
    const task = await this.deps.tickets.getSummary(ticketId);
    return task ? ticketUrl(task.spaceSlug, task.key) : null;
  }
}
