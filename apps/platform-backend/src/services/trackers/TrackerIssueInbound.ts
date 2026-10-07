import type { Severity, TicketMetadata, TicketOrigin } from "@viberglass/types";
import { isViberglassComment } from "@viberglass/integration-core";
import { createChildLogger } from "../../config/logger";
import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import { TaskIssueLinkDAO } from "../../persistence/ticketing/TaskIssueLinkDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { AgentQuestionAnswerService } from "../questions/AgentQuestionAnswerService";
import { TaskDiscussionService } from "../tasks/TaskDiscussionService";
import type { TaskTurnService } from "../taskTurns/TaskTurnService";
import type { WebhookPlanRequester } from "../../webhooks/WebhookPlanRequester";

const logger = createChildLogger({ service: "TrackerIssueInbound" });

/** Where an issue event came from: the tracker, the space it goes to, and the connection it came through. */
export interface TrackerContext {
  provider: Extract<TicketOrigin, "jira" | "shortcut" | "github">;
  projectId: string;
  integrationId: string | null;
  webhookConfigId: string | null;
}

export interface TrackerPerson {
  name: string;
  /** Matches them to a Viberglass account when the tracker shares it. */
  email: string | null;
}

export interface OpenedIssue {
  key: string;
  url: string | null;
  apiBaseUrl: string | null;
  title: string;
  description: string;
  author: TrackerPerson | null;
  severity: Severity;
  /** Whether the agent writes the plan for it straight away. */
  plan: boolean;
  /** Tracker details kept on the task, such as the issue type. */
  metadata: Record<string, unknown>;
}

export interface IssueComment {
  issueKey: string;
  author: TrackerPerson;
  body: string;
  /** Whether it mentions the connection's bot account, which asks the agent; the mention is already taken out of `body`. */
  mentionsBot: boolean;
}

export interface TrackerEventResult {
  ticketId?: string;
  jobId?: string;
  ignoredReason?: string;
}

interface Dependencies {
  tickets: Pick<TicketDAO, "createTicket" | "updateTicket">;
  links: Pick<TaskIssueLinkDAO, "create" | "findTicket">;
  users: Pick<UserDAO, "findByEmail">;
  discussion: Pick<TaskDiscussionService, "createFromTracker">;
  questions: Pick<AgentQuestionDAO, "listOpenForTasks">;
  answers: Pick<AgentQuestionAnswerService, "answer">;
  turns: Pick<TaskTurnService, "ask">;
  planner: Pick<WebhookPlanRequester, "request">;
}

/**
 * A tracker issue as a task's linked thread, whichever tracker it is: a new
 * issue creates the task, an edit updates it, and a comment is a message in
 * its thread. A comment that mentions the bot asks the agent; a reply from the
 * person the agent asked answers its question.
 */
export class TrackerIssueInbound {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "answers" | "turns" | "planner"> & Partial<Dependencies>) {
    this.deps = {
      tickets: new TicketDAO(),
      links: new TaskIssueLinkDAO(),
      users: new UserDAO(),
      discussion: new TaskDiscussionService(),
      questions: new AgentQuestionDAO(),
      ...deps,
    };
  }

  async opened(context: TrackerContext, issue: OpenedIssue): Promise<TrackerEventResult> {
    if (await this.deps.links.findTicket(context.provider, issue.key, context.projectId)) {
      return { ignoredReason: `The ${context.provider} issue '${issue.key}' already has a task` };
    }
    const requesterId = issue.author ? await this.personId(issue.author) : null;
    const tracker: Record<string, unknown> = { ...issue.metadata, provider: context.provider, externalTicketId: issue.key, externalTicketUrl: issue.url };
    const metadata: TicketMetadata = { timestamp: new Date().toISOString(), timezone: "UTC", ...tracker };
    const ticket = await this.deps.tickets.createTicket({
      projectId: context.projectId,
      title: issue.title,
      description: issue.description,
      severity: issue.severity,
      category: context.provider,
      metadata,
      annotations: [],
      autoFixRequested: false,
      ticketSystem: context.provider,
      requesterId: requesterId ?? undefined,
    });
    await this.deps.tickets.updateTicket(ticket.id, { externalTicketId: issue.key, externalTicketUrl: issue.url ?? undefined });
    await this.deps.links.create({
      ticketId: ticket.id,
      provider: context.provider,
      issueKey: issue.key,
      issueUrl: issue.url,
      integrationId: context.integrationId,
      webhookConfigId: context.webhookConfigId,
      apiBaseUrl: issue.apiBaseUrl,
    });
    if (!issue.plan) return { ticketId: ticket.id };
    return { ticketId: ticket.id, jobId: await this.deps.planner.request(ticket.id) };
  }

  async edited(context: TrackerContext, issue: { key: string; title?: string; description?: string }): Promise<TrackerEventResult> {
    const ticketId = await this.deps.links.findTicket(context.provider, issue.key, context.projectId);
    if (!ticketId) return { ignoredReason: `No task is linked to the ${context.provider} issue '${issue.key}'` };
    const title = issue.title?.trim();
    await this.deps.tickets.updateTicket(ticketId, {
      ...(title ? { title } : {}),
      ...(issue.description !== undefined ? { description: issue.description } : {}),
    });
    return { ticketId };
  }

  async commented(context: TrackerContext, comment: IssueComment): Promise<TrackerEventResult> {
    if (isViberglassComment(comment.body)) return { ignoredReason: "Posted by Viberglass" };
    const ticketId = await this.deps.links.findTicket(context.provider, comment.issueKey, context.projectId);
    if (!ticketId) return { ignoredReason: `No task is linked to the ${context.provider} issue '${comment.issueKey}'` };
    const body = comment.body.trim();
    if (!body) return { ticketId, ignoredReason: "The comment is empty" };

    const userId = await this.personId(comment.author);
    if (userId && !comment.mentionsBot) {
      const open = (await this.deps.questions.listOpenForTasks([ticketId])).get(ticketId) ?? [];
      const theirs = open.find((question) => question.askedOf?.id === userId);
      if (theirs) {
        const asked = await this.deps.answers.answer(ticketId, theirs.id, userId, body);
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

  private async personId(person: TrackerPerson): Promise<string | null> {
    if (!person.email) return null;
    const user = await this.deps.users.findByEmail(person.email);
    return user && !user.deactivatedAt ? user.id : null;
  }
}
