import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, PartRange, TaskCodeBranch, TaskMessage, TaskTimelineEntry, TaskTurnAction } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

/** The task's thread: messages, the agent's turns, document versions and what happened, oldest first. */
export async function getTaskTimeline(taskId: string): Promise<TaskTimelineEntry[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/timeline`), 'Failed to load the thread')
}

/** The agent an ask goes to when it names none; null, with why, when none would run. */
export interface NextAgent {
  clankerId: string | null
  name: string | null
  via: 'named' | 'on_task' | 'space_default' | 'default' | 'first_ready' | null
  problem: string | null
}

export async function getNextAgent(taskId: string): Promise<NextAgent> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/next-agent`), 'Failed to load the agent')
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
  ask: { action?: TaskTurnAction; agentId?: string; parts?: PartRange } = {}
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
  ask: { action: TaskTurnAction; body?: string; agentId?: string; parts?: PartRange }
): Promise<AskedTurn> {
  const { turn } = await postTaskMessage(taskId, ask.body ?? '', { action: ask.action, agentId: ask.agentId, parts: ask.parts })
  if (!turn) throw new Error('The agent was not asked')
  return turn
}

/** Answers the agent's question; the answer is your message in the thread, and the agent's next turn reads it. */
export async function answerQuestion(taskId: string, questionId: string, answer: string): Promise<AskedTurn> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/questions/${questionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to answer the question')
  const data: { turn: AskedTurn } = await response.json()
  return data.turn
}

async function steer(taskId: string, what: 'pause' | 'resume', fallback: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/agent/${what}`, { method: 'POST' })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
}

/** Stops the agent's turn and starts one that answers this message straight away. */
export async function interruptAgent(taskId: string, body: string): Promise<AskedTurn> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/agent/interrupt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to interrupt the agent')
  const data: { turn: AskedTurn } = await response.json()
  return data.turn
}

/** Stops the agent's turn, if it's working, and holds what people ask until it's resumed. */
export function pauseAgent(taskId: string): Promise<void> {
  return steer(taskId, 'pause', 'Failed to pause the agent')
}

/** What resuming, or handing back, carries on: one agent, and the step it asks for again (null: it reads what was written). */
export interface ResumeTarget {
  sessionId: string
  clankerId: string
  action: TaskTurnAction | null
}

export async function getResumeTarget(taskId: string): Promise<ResumeTarget | null> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/agent/resume-target`), 'Failed to load what the agent carries on with')
}

export function resumeAgent(taskId: string): Promise<void> {
  return steer(taskId, 'resume', 'Failed to let the agent carry on')
}

/** The task's branch and who has its work; null when its space has no repository. */
export async function getTaskBranch(taskId: string): Promise<TaskCodeBranch | null> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/branch`), 'Failed to load the task branch')
}

/** Pauses the agent and makes the work yours, on the task's branch. */
export async function takeOverTask(taskId: string): Promise<TaskCodeBranch | null> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/agent/take-over`, { method: 'POST' }), 'Failed to take the work over')
}

/** Gives the work back to the agent, which carries on from what you pushed. */
export async function handBackTask(taskId: string, note: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/agent/hand-back`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to hand the work back')
}

/** Tries every run a setup failure paused again, once it's fixed; admins only. Returns how many tasks it retried. */
export async function retryPausedRuns(): Promise<number> {
  const data = await read<{ retried: number }>(
    await apiFetch(`${API_BASE_URL}/api/tasks/paused-runs/retry`, { method: 'POST' }),
    'Failed to retry the paused runs'
  )
  return data.retried
}

/** Done with being mentioned on the task, without replying: it stops being your move. */
export async function markMentionsDone(taskId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/mentions/done`, { method: 'POST' })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to acknowledge the mention')
}
