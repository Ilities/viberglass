import type { InboundComment, InboundIssue } from "@viberglass/types";
import { isViberglassComment } from "@viberglass/integration-core";
import { createChildLogger } from "../../config/logger";
import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import { TaskIssueLinkDAO } from "../../persistence/ticketing/TaskIssueLinkDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { AgentQuestionAnswerService } from "../questions/AgentQuestionAnswerService";
import { TaskDiscussionService } from "../tasks/TaskDiscussionService";
import type { TaskTurnService } from "../taskTurns/TaskTurnService";
import type { TrackerIssueRouter } from "./TrackerIssueRouter";
import type { TrackerIssueTaskOpener } from "./TrackerIssueTaskOpener";
import { trackerPersonId } from "./trackerPersonId";

const logger = createChildLogger({ service: "TrackerIssueInbound" });

/** Where an issue event came from: the tracker, and the connection and webhook it came through. */
export interface TrackerContext {
  /** The webhook provider, which names the tracker. */
  provider: string;
  integrationId: string;
  webhookConfigId: string;
}

export interface TrackerEventResult {
  ticketId?: string;
  projectId?: string;
  jobId?: string;
  ignoredReason?: string;
}

interface Dependencies {
  router: Pick<TrackerIssueRouter, "route">;
  opener: Pick<TrackerIssueTaskOpener, "open">;
  tickets: Pick<TicketDAO, "updateTicket">;
  links: Pick<TaskIssueLinkDAO, "findTickets">;
  users: Pick<UserDAO, "findByEmail">;
  discussion: Pick<TaskDiscussionService, "createFromTracker">;
  questions: Pick<AgentQuestionDAO, "listOpenForTasks">;
  answers: Pick<AgentQuestionAnswerService, "answer">;
  turns: Pick<TaskTurnService, "ask">;
}

/**
 * A tracker issue as the linked thread of a task in each space that takes it,
 * whichever tracker it is. A new or changed issue gets a task in every space
 * that takes it and doesn't have one yet, and its edits update the tasks it
 * has. A comment is a message in each task's thread: a mention of the bot asks
 * the agent, and a reply from the person the agent asked answers its question.
 */
export class TrackerIssueInbound {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "router" | "opener" | "answers" | "turns"> & Partial<Dependencies>) {
    this.deps = {
      tickets: new TicketDAO(),
      links: new TaskIssueLinkDAO(),
      users: new UserDAO(),
      discussion: new TaskDiscussionService(),
      questions: new AgentQuestionDAO(),
      ...deps,
    };
  }

  async issue(context: TrackerContext, issue: InboundIssue): Promise<TrackerEventResult> {
    const linked = await this.deps.links.findTickets(context.provider, issue.key, context.integrationId);
    const title = issue.title?.trim();
    for (const { ticketId } of linked) {
      await this.deps.tickets.updateTicket(ticketId, {
        ...(title ? { title } : {}),
        ...(issue.description !== undefined ? { description: issue.description } : {}),
      });
    }

    const { spaces, reason } = await this.deps.router.route(context, issue);
    const fresh = spaces.filter((space) => !linked.some((task) => task.projectId === space.projectId));
    const first: TrackerEventResult = linked[0] ? { ticketId: linked[0].ticketId, projectId: linked[0].projectId } : {};
    if (fresh.length === 0) return linked.length > 0 ? first : { ignoredReason: reason ?? "No space takes the issue" };
    if (!title) return { ...first, ignoredReason: `The ${context.provider} event doesn't carry the issue's title` };

    const opened: TrackerEventResult[] = [];
    for (const space of fresh) opened.push(await this.deps.opener.open(context, { ...issue, title }, space));
    return opened[0];
  }

  async commented(context: TrackerContext, comment: InboundComment): Promise<TrackerEventResult> {
    if (isViberglassComment(comment.body)) return { ignoredReason: "Posted by Viberglass" };
    const linked = await this.deps.links.findTickets(context.provider, comment.issueKey, context.integrationId);
    if (linked.length === 0) return { ignoredReason: `No task is linked to the ${context.provider} issue '${comment.issueKey}'` };
    const body = comment.body.trim();
    if (!body) return { ticketId: linked[0].ticketId, projectId: linked[0].projectId, ignoredReason: "The comment is empty" };

    const userId = await trackerPersonId(this.deps.users, comment.author);
    const results: TrackerEventResult[] = [];
    for (const task of linked) {
      results.push({ projectId: task.projectId, ...(await this.commentOn(task.ticketId, context, comment, userId, body)) });
    }
    return results.find((result) => result.jobId) ?? results[0];
  }

  private async commentOn(ticketId: string, context: TrackerContext, comment: InboundComment, userId: string | null, body: string): Promise<TrackerEventResult> {
    if (userId && !comment.mentionsBot) {
      const open = (await this.deps.questions.listOpenForTasks([ticketId])).get(ticketId) ?? [];
      const theirs = open.find((question) => question.askedOf?.id === userId);
      if (theirs) {
        const asked = await this.deps.answers.answer(ticketId, theirs.id, userId, body, { source: context.provider });
        return { ticketId, jobId: asked.job.id ?? undefined };
      }
    }

    const messageId = await this.deps.discussion.createFromTracker(ticketId, { userId, name: comment.author.name, source: context.provider }, body);
    if (!comment.mentionsBot) return { ticketId };
    try {
      // Someone without an account asks as the connection does; anyone who can comment can already open issues.
      const asked = await this.deps.turns.ask(ticketId, userId, { message: body, postedMessageId: messageId, fromWebhook: !userId });
      return { ticketId, jobId: asked.job.id ?? undefined };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn("A tracker comment couldn't ask the agent", { ticketId, reason });
      return { ticketId, ignoredReason: `The agent wasn't asked: ${reason}` };
    }
  }
}
