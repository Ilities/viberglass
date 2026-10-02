import { mentionToken, type TaskTurnAction } from "@viberglass/types";
import { runAsActor } from "../api/auth/requestActor";
import { AgentQuestionDAO } from "../persistence/agentSession/AgentQuestionDAO";
import { UserDAO } from "../persistence/user/UserDAO";
import { isTaskAskPolicyError } from "../services/errors/TaskAskPolicyError";
import type { AgentQuestionAnswerService } from "../services/questions/AgentQuestionAnswerService";
import { TaskDiscussionService } from "../services/tasks/TaskDiscussionService";
import type { TaskTurnService } from "../services/taskTurns/TaskTurnService";

export const LINK_SLACK_ACCOUNT = "Link your Slack account in Viberglass (Settings → Notifications) to take part in tasks from Slack.";

/** A Slack mention: `<@U123>` or `<@U123|name>`. */
const SLACK_MENTION = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g;
/** How a message to the bot starts: its mention, raw or as the SDK renders it. */
const LEADING_MENTION = /^\s*(<@[A-Z0-9]+(?:\|[^>]*)?>|@\S+)\s*/;

interface Dependencies {
  users: Pick<UserDAO, "findActiveIdBySlackUserId" | "getContact">;
  questions: Pick<AgentQuestionDAO, "listOpenForTasks" | "getById">;
  answers: Pick<AgentQuestionAnswerService, "answer">;
  turns: Pick<TaskTurnService, "ask">;
  discussion: Pick<TaskDiscussionService, "create">;
}

/**
 * What people do in a task's Slack thread, done in its Viberglass thread as
 * the person whose Slack account it is. A reply from someone the agent asked
 * answers its question; a message that mentions the bot asks the agent; any
 * other message is a message in the thread, for the people on the task.
 */
export class TaskThreadInbound {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "answers" | "turns"> & Partial<Dependencies>) {
    this.deps = {
      users: new UserDAO(),
      questions: new AgentQuestionDAO(),
      discussion: new TaskDiscussionService(),
      ...deps,
    };
  }

  async receive(input: { ticketId: string; slackUserId: string; text: string; mentionsBot: boolean }): Promise<void> {
    const actorId = await this.linkedPerson(input.slackUserId);
    const body = await this.threadText(input.mentionsBot ? input.text.replace(LEADING_MENTION, "") : input.text);
    if (!body) return;
    await runAsActor({ userId: actorId, slackUserId: input.slackUserId }, async () => {
      const open = (await this.deps.questions.listOpenForTasks([input.ticketId])).get(input.ticketId) ?? [];
      const theirs = open.find((question) => question.askedOf?.id === actorId);
      if (theirs && !input.mentionsBot) {
        await this.deps.answers.answer(input.ticketId, theirs.id, actorId, body);
      } else if (input.mentionsBot) {
        await this.deps.turns.ask(input.ticketId, actorId, { message: body });
      } else {
        await this.deps.discussion.create(input.ticketId, actorId, body);
      }
    });
  }

  /** A step asked for with a button or the launch form. Someone without a linked account can still start one: it asks in no words. */
  async ask(input: { ticketId: string; slackUserId: string; action: TaskTurnAction; agentId?: string }): Promise<void> {
    const actorId = await this.deps.users.findActiveIdBySlackUserId(input.slackUserId);
    try {
      await runAsActor({ userId: actorId, slackUserId: input.slackUserId }, () =>
        this.deps.turns.ask(input.ticketId, actorId, { message: "", action: input.action, agentId: input.agentId }),
      );
    } catch (error) {
      if (!actorId && isTaskAskPolicyError(error)) throw new Error(LINK_SLACK_ACCOUNT);
      throw error;
    }
  }

  /** An option button under the agent's question. */
  async answer(input: { questionId: string; option: number; slackUserId: string }): Promise<void> {
    const actorId = await this.linkedPerson(input.slackUserId);
    const question = await this.deps.questions.getById(input.questionId);
    const answer = question?.options[input.option];
    if (!question || answer === undefined) throw new Error("That question isn't there any more.");
    await runAsActor({ userId: actorId, slackUserId: input.slackUserId }, () =>
      this.deps.answers.answer(question.ticketId, question.id, actorId, answer),
    );
  }

  private async linkedPerson(slackUserId: string): Promise<string> {
    const actorId = await this.deps.users.findActiveIdBySlackUserId(slackUserId);
    if (!actorId) throw new Error(LINK_SLACK_ACCOUNT);
    return actorId;
  }

  /** Slack mentions of people with linked accounts become mentions of them; others are dropped. */
  private async threadText(text: string): Promise<string> {
    let body = text;
    for (const [mention, slackUserId] of [...text.matchAll(SLACK_MENTION)]) {
      const userId = await this.deps.users.findActiveIdBySlackUserId(slackUserId);
      const contact = userId ? await this.deps.users.getContact(userId) : null;
      body = body.replace(mention, userId && contact ? mentionToken(contact.name, userId) : "");
    }
    return body.replace(/[ \t]+/g, " ").trim();
  }
}
