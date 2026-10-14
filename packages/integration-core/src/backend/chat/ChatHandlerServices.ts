import type { PartRange, SpaceBackingKind, TaskTurnAction } from '@viberglass/types'
import type { Thread } from 'chat'

export interface ChatSpaceSummary {
  id: string
  name: string
  backingKind: SpaceBackingKind
}

export interface ChatAgentSummary {
  id: string
  name: string
}

/**
 * What the platform does for a chat service's handlers. A task started from
 * chat has a thread there that mirrors its thread in Viberglass; what people
 * do in it is done on the task as them, through the account they linked.
 * `chatUserId` is the person's id on the chat service.
 */
export interface ChatHandlerServices {
  /** What to tell someone whose chat account isn't linked to a Viberglass account; null once it is. */
  unlinkedAccountMessage(chatUserId: string): Promise<string | null>
  /** The spaces the person's linked account can see; every space for an unlinked account. */
  listProjects(chatUserId: string): Promise<ChatSpaceSummary[]>
  listClankers(): Promise<ChatAgentSummary[]>
  /** The person's linked account, if any, is the task's requester. */
  createTicket(params: { projectId: string; title: string; description: string; chatUserId: string }): Promise<{ id: string; projectId: string }>
  getProject(id: string): Promise<{ id: string; slug: string } | null>
  ticketUrl(projectSlug: string, ticketId: string): string | null

  /** Makes the chat thread the task's, so the task's thread is mirrored in it. */
  linkTaskThread(ticketId: string, thread: Thread): Promise<void>
  getTaskForThread(threadId: string): Promise<string | undefined>

  /** A message in the task's chat thread: an answer to the agent, an ask of it when it mentions the bot, else a message. */
  receiveThreadMessage(params: { ticketId: string; chatUserId: string; text: string; mentionsBot: boolean }): Promise<void>
  /** Asks the agent for a step, from a button or the launch form. */
  askAgent(params: { ticketId: string; chatUserId: string; action: TaskTurnAction; agentId?: string; parts?: PartRange }): Promise<void>
  /** Answers the agent's question with one of its options. */
  answerQuestion(params: { questionId: string; option: number; chatUserId: string }): Promise<void>
  /** Marks the task done, as the web's Mark done does, for whoever may change it. */
  markDone(params: { ticketId: string; chatUserId: string }): Promise<void>
}
