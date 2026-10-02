import type { TaskPerson } from './taskSituation'

export type AgentQuestionStatus = 'open' | 'answered' | 'cancelled'

/** A question an agent asked a person on the task with its ask_human tool. */
export interface AgentQuestion {
  id: string
  sessionId: string
  agent: { id: string; name: string }
  /** Whom it went to; null when nobody on the task could be found. */
  askedOf: TaskPerson | null
  question: string
  /** Answers the agent offered, when the answer is a choice. */
  options: string[]
  /** Whether the agent stopped until it's answered. */
  blocking: boolean
  status: AgentQuestionStatus
  askedAt: string
  answer: { by: TaskPerson | null; text: string; at: string } | null
}
