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
  | 'user_joined'
  | 'user_left'
  | 'presence_update'

export type AgentPendingRequestType = 'input' | 'approval'
export type AgentPendingRequestStatus = 'open' | 'resolved' | 'expired' | 'cancelled'
export type AgentTurnRole = 'user' | 'assistant' | 'system'
export type AgentTurnStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled'

export interface AgentSession {
  id: string
  tenantId: string
  projectId: string
  projectSlug: string | null
  ticketId: string
  ticketTitle: string | null
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
  userId: string | null
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
  userId: string | null
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

// Helpers

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new Error((body?.message || body?.error) ?? fallback)
}

// API Functions

export async function listSessionsForTicket(ticketId: string): Promise<AgentSession[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/agent-sessions`)
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
