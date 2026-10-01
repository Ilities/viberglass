import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, TaskMessage, TaskTimelineEntry, TaskTurnAction } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

/** The task's thread: messages, the agent's turns, document versions and what happened, oldest first. */
export async function getTaskTimeline(taskId: string): Promise<TaskTimelineEntry[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/timeline`), 'Failed to load the thread')
}

/** The agent's turn a message started, or joined while one was running. */
export interface AskedTurn {
  sessionId: string
  turnId: string
  jobId: string | null
  status: string
}

export interface PostedMessage {
  messages: TaskMessage[]
  /** Null when the message asked the agent for nothing. */
  turn: AskedTurn | null
}

/**
 * Posts in the task's thread. A message that mentions an agent, or carries an
 * action, also starts the agent's turn.
 */
export async function postTaskMessage(
  taskId: string,
  body: string,
  ask: { action?: TaskTurnAction; agentId?: string } = {}
): Promise<PostedMessage> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, ...ask }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to post the message')
  const data: ApiResponse<TaskMessage[]> & { turn?: AskedTurn } = await response.json()
  return { messages: data.data, turn: data.turn ?? null }
}

/** Asks the agent for something, as a message from you in the thread. */
export async function askAgent(
  taskId: string,
  ask: { action: TaskTurnAction; body?: string; agentId?: string }
): Promise<AskedTurn> {
  const { turn } = await postTaskMessage(taskId, ask.body ?? '', { action: ask.action, agentId: ask.agentId })
  if (!turn) throw new Error('The agent was not asked')
  return turn
}
