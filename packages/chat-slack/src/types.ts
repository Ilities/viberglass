import type { PartRange, TaskTurnAction } from "@viberglass/types";
import type { Thread } from "chat";

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface ClankerSummary {
  id: string;
  name: string;
}

/**
 * Services the backend provides to the Slack handlers. A task started from
 * Slack has a thread there that mirrors its thread in Viberglass; what people
 * do in it is done on the task as them (their linked Viberglass account).
 */
export interface SlackHandlerServices {
  /** The spaces the Slack user's linked account can see; every space for an unlinked account. */
  listProjects(slackUserId: string): Promise<ProjectSummary[]>;
  listClankers(): Promise<ClankerSummary[]>;
  /** The Slack user's linked account, if any, is the task's requester. */
  createTicket(params: { projectId: string; title: string; description: string; slackUserId: string }): Promise<{ id: string; projectId: string }>;
  getProject(id: string): Promise<{ id: string; slug: string } | null>;
  ticketUrl(projectSlug: string, ticketId: string): string | null;

  /** Makes the Slack thread the task's, so the task's thread is mirrored in it. */
  linkTaskThread(ticketId: string, thread: Thread): Promise<void>;
  getTaskForThread(threadId: string): Promise<string | undefined>;

  /** A message in the task's Slack thread: an answer to the agent, an ask of it when it mentions the bot, else a message. */
  receiveThreadMessage(params: { ticketId: string; slackUserId: string; text: string; mentionsBot: boolean }): Promise<void>;
  /** Asks the agent for a step, from a button or the launch form. */
  askAgent(params: { ticketId: string; slackUserId: string; action: TaskTurnAction; agentId?: string; parts?: PartRange }): Promise<void>;
  /** Answers the agent's question with one of its options. */
  answerQuestion(params: { questionId: string; option: number; slackUserId: string }): Promise<void>;
}
