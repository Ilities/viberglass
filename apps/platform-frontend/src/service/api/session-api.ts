import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

// Types

export type AgentSessionMode = 'research' | 'planning' | 'execution'

export type AgentSessionStatus =
  | 'active'
  | 'waiting_on_user'
  | 'waiting_on_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentSessionEventType =
  | 'session_started'
  | 'turn_started'
  | 'user_message'
  | 'assistant_message'
  | 'progress'
  | 'reasoning'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'needs_input'
  | 'needs_approval'
  | 'approval_resolved'
  | 'artifact_updated'
  | 'turn_completed'
  | 'turn_failed'
  | 'session_completed'
  | 'session_failed'
  | 'session_cancelled'

export type AgentPendingRequestType = 'input' | 'approval'
export type AgentPendingRequestStatus = 'open' | 'resolved' | 'expired' | 'cancelled'
export type AgentTurnRole = 'user' | 'assistant' | 'system'
export type AgentTurnStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled'

export interface AgentSession {
  id: string
  tenantId: string
  projectId: string
  ticketId: string
  clankerId: string
  mode: AgentSessionMode
  status: AgentSessionStatus
  title: string | null
  repository: string | null
  baseBranch: string | null
  workspaceBranch: string | null
  draftPullRequestUrl: string | null
  headCommitHash: string | null
  lastJobId: string | null
  lastTurnId: string | null
  latestPendingRequestId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface AgentTurn {
  id: string
  sessionId: string
  role: AgentTurnRole
  status: AgentTurnStatus
  sequence: number
  contentMarkdown: string | null
  jobId: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentSessionEvent {
  id: string
  sessionId: string
  turnId: string | null
  jobId: string | null
  sequence: number
  eventType: AgentSessionEventType
  payloadJson: Record<string, unknown>
  createdAt: string
}

export interface AgentPendingRequest {
  id: string
  sessionId: string
  turnId: string | null
  jobId: string | null
  requestType: AgentPendingRequestType
  status: AgentPendingRequestStatus
  promptMarkdown: string
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SessionDetail {
  session: AgentSession
  turns: AgentTurn[]
  latestEvents: AgentSessionEvent[]
  pendingRequest: AgentPendingRequest | null
}

export interface LaunchSessionParams {
  clankerId: string
  mode: AgentSessionMode
  initialMessage: string
}

export interface LaunchSessionResult {
  session: AgentSession
  currentTurn: AgentTurn
  job: { id: string; status: string }
}

const TERMINAL_EVENT_TYPES: AgentSessionEventType[] = [
  'session_completed',
  'session_failed',
  'session_cancelled',
]

export function isTerminalEventType(type: AgentSessionEventType): boolean {
  return TERMINAL_EVENT_TYPES.includes(type)
}

// Helpers

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new Error((body?.message || body?.error) ?? fallback)
}

// API Functions

export async function launchSession(ticketId: string, params: LaunchSessionParams): Promise<LaunchSessionResult> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/agent-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) return throwApiError(res, 'Failed to launch session')
  const data = await res.json()
  return data.data
}

export async function listSessionsForTicket(ticketId: string): Promise<AgentSession[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/agent-sessions`)
  if (!res.ok) return throwApiError(res, 'Failed to list sessions')
  const data = await res.json()
  return data.data
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const res = await apiFetch(`${API_BASE_URL}/api/agent-sessions/${sessionId}`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch session')
  const data = await res.json()
  return data.data
}

export async function listSessionEvents(
  sessionId: string,
  opts?: { afterSequence?: number; limit?: number }
): Promise<AgentSessionEvent[]> {
  const params = new URLSearchParams()
  if (opts?.afterSequence != null) params.set('afterSequence', String(opts.afterSequence))
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const res = await apiFetch(`${API_BASE_URL}/api/agent-sessions/${sessionId}/events${qs ? `?${qs}` : ''}`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch session events')
  const data = await res.json()
  return data.data
}

export async function replyToSession(sessionId: string, replyText: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/agent-sessions/${sessionId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyText }),
  })
  if (!res.ok) return throwApiError(res, 'Failed to send reply')
}

export async function approveSession(sessionId: string, approved: boolean): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/agent-sessions/${sessionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved }),
  })
  if (!res.ok) return throwApiError(res, 'Failed to submit approval')
}

export async function cancelSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/agent-sessions/${sessionId}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) return throwApiError(res, 'Failed to cancel session')
}

export function getEventStreamUrl(sessionId: string): string {
  return `${API_BASE_URL}/api/agent-sessions/${sessionId}/events/stream`
}
