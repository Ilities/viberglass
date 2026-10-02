import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

// Types

export type AgentSessionMode = 'research' | 'planning' | 'execution'

export type AgentSessionStatus =
  | 'active'
  | 'waiting_on_user'
  | 'waiting_on_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

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
