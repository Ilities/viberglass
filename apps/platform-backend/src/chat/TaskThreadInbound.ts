import { mentionToken, type PartRange, type TaskTurnAction } from "@viberglass/types";
import { runAsActor } from "../api/auth/requestActor";
import { AgentQuestionDAO } from "../persistence/agentSession/AgentQuestionDAO";
import type { ChatProvider } from "@viberglass/integration-core";
import { ChatIdentityDAO } from "../persistence/user/ChatIdentityDAO";
import { UserDAO } from "../persistence/user/UserDAO";
import { isTaskAskPolicyError } from "../services/errors/TaskAskPolicyError";
import type { AgentQuestionAnswerService } from "../services/questions/AgentQuestionAnswerService";
import { TaskDiscussionService } from "../services/tasks/TaskDiscussionService";
import type { TaskTurnService } from "../services/taskTurns/TaskTurnService";

/** What someone without a linked account is told when they try to take part from chat. */
export function linkAccountMessage(label: string): string {
  return `Link your ${label} account in Viberglass (Settings → Notifications) to take part in tasks from ${label}.`;
}

/** The chat service the thread is on. */
export interface ChatServiceOf {
  label: string;
  provider: Pick<ChatProvider, "adapterName" | "mentions" | "withoutBotMention">;
}

interface Dependencies {
  identities: Pick<ChatIdentityDAO, "findActiveUserId">;
  users: Pick<UserDAO, "getContact">;
  questions: Pick<AgentQuestionDAO, "listOpenForTasks" | "getById">;
  answers: Pick<AgentQuestionAnswerService, "answer">;
  turns: Pick<TaskTurnService, "ask">;
  discussion: Pick<TaskDiscussionService, "create">;
}

/**
 * What people do in a task's chat thread, done in its Viberglass thread as
 * the person whose chat account it is. A reply from someone the agent asked
 * answers its question; a message that mentions the bot asks the agent; any
 * other message is a message in the thread, for the people on the task.
 */
export class TaskThreadInbound {
  private readonly deps: Dependencies;

  constructor(
    private readonly service: ChatServiceOf,
    deps: Pick<Dependencies, "answers" | "turns"> & Partial<Dependencies>,
  ) {
    this.deps = {
      identities: new ChatIdentityDAO(),
      users: new UserDAO(),
      questions: new AgentQuestionDAO(),
      discussion: new TaskDiscussionService(),
      ...deps,
    };
  }

  async receive(input: { ticketId: string; chatUserId: string; text: string; mentionsBot: boolean }): Promise<void> {
    const actorId = await this.linkedPerson(input.chatUserId);
    const body = await this.threadText(input.mentionsBot ? this.service.provider.withoutBotMention(input.text) : input.text);
    if (!body) return;
    await runAsActor({ userId: actorId, chat: this.actor(input.chatUserId) }, async () => {
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
  async ask(input: { ticketId: string; chatUserId: string; action: TaskTurnAction; agentId?: string; parts?: PartRange }): Promise<void> {
    const actorId = await this.personOf(input.chatUserId);
    try {
      await runAsActor({ userId: actorId, chat: this.actor(input.chatUserId) }, () =>
        this.deps.turns.ask(input.ticketId, actorId, { message: "", action: input.action, agentId: input.agentId, parts: input.parts }),
      );
    } catch (error) {
      if (!actorId && isTaskAskPolicyError(error)) throw new Error(linkAccountMessage(this.service.label));
      throw error;
    }
  }

  /** An option button under the agent's question. */
  async answer(input: { questionId: string; option: number; chatUserId: string }): Promise<void> {
    const actorId = await this.linkedPerson(input.chatUserId);
    const question = await this.deps.questions.getById(input.questionId);
    const answer = question?.options[input.option];
    if (!question || answer === undefined) throw new Error("That question isn't there any more.");
    await runAsActor({ userId: actorId, chat: this.actor(input.chatUserId) }, () =>
      this.deps.answers.answer(question.ticketId, question.id, actorId, answer),
    );
  }

  private actor(chatUserId: string) {
    return { adapterName: this.service.provider.adapterName, chatUserId };
  }

  private personOf(chatUserId: string): Promise<string | null> {
    return this.deps.identities.findActiveUserId(this.service.provider.adapterName, chatUserId);
  }

  private async linkedPerson(chatUserId: string): Promise<string> {
    const actorId = await this.personOf(chatUserId);
    if (!actorId) throw new Error(linkAccountMessage(this.service.label));
    return actorId;
  }

  /** Mentions of people with linked accounts become mentions of them; others are dropped. */
  private async threadText(text: string): Promise<string> {
    let body = text;
    for (const mention of this.service.provider.mentions(text)) {
      const userId = await this.personOf(mention.chatUserId);
      const contact = userId ? await this.deps.users.getContact(userId) : null;
      body = body.replace(mention.text, userId && contact ? mentionToken(contact.name, userId) : "");
    }
    return body.replace(/[ \t]+/g, " ").trim();
  }
}
