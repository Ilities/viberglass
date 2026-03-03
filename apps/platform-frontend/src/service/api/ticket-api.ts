import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  CreateTicketRequest,
  PaginatedResponse,
  Ticket,
  TicketListParams,
  TicketStats,
  TicketWorkflowPhase,
  UpdateTicketRequest,
  WebhookStatus,
} from '@viberglass/types'

export interface TicketListResponse {
  tickets: Ticket[]
  pagination: {
    limit: number
    offset: number
    count: number
    total: number
  }
}

export interface TicketWorkflowPhaseState {
  phase: TicketWorkflowPhase
  status: 'completed' | 'current' | 'upcoming'
}

export interface TicketWorkflowResponse {
  ticketId: string
  workflowPhase: TicketWorkflowPhase
  phases: TicketWorkflowPhaseState[]
}

// Tickets API
export async function getTickets(params: TicketListParams = {}): Promise<TicketListResponse> {
  const {
    projectId,
    projectSlug,
    limit = 50,
    offset = 0,
    statuses,
    workflowPhases,
    archived,
    severity,
    search,
  } = params

  const queryParams = new URLSearchParams()
  if (projectSlug) {
    queryParams.set('projectSlug', projectSlug)
  } else if (projectId) {
    queryParams.set('projectId', projectId)
  }
  queryParams.set('limit', String(limit))
  queryParams.set('offset', String(offset))
  if (statuses && statuses.length > 0) {
    queryParams.set('statuses', statuses.join(','))
  }
  if (workflowPhases && workflowPhases.length > 0) {
    queryParams.set('workflowPhases', workflowPhases.join(','))
  }
  if (archived) {
    queryParams.set('archived', archived)
  }
  if (severity) {
    queryParams.set('severity', severity)
  }
  if (search && search.trim()) {
    queryParams.set('search', search.trim())
  }

  const response = await apiFetch(`${API_BASE_URL}/api/tickets?${queryParams.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch tickets')
  }
  const data: PaginatedResponse<Ticket> = await response.json()
  return {
    tickets: data.data,
    pagination: {
      limit: data.pagination.limit,
      offset: data.pagination.offset,
      count: data.pagination.count,
      total: data.pagination.total ?? data.pagination.count,
    },
  }
}

export async function getTicketStats(params: { projectId?: string; projectSlug?: string } = {}): Promise<TicketStats> {
  const { projectId, projectSlug } = params
  const query = projectSlug ? `projectSlug=${projectSlug}` : projectId ? `projectId=${projectId}` : ''
  const url = query ? `${API_BASE_URL}/api/tickets/stats?${query}` : `${API_BASE_URL}/api/tickets/stats`
  const response = await apiFetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch ticket stats')
  }
  const data: ApiResponse<TicketStats> = await response.json()
  return data.data
}

export async function getTicket(id: string): Promise<Ticket> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ticket not found')
    }
    throw new Error('Failed to fetch ticket')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

export async function getTicketWorkflow(id: string): Promise<TicketWorkflowResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${id}/phases`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ticket not found')
    }
    throw new Error('Failed to fetch ticket workflow')
  }
  const data: ApiResponse<TicketWorkflowResponse> = await response.json()
  return data.data
}

export async function advanceTicketWorkflowPhase(
  id: string,
  phase: TicketWorkflowPhase
): Promise<{ ticketId: string; workflowPhase: TicketWorkflowPhase }> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${id}/phases/${phase}/advance`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to advance ticket workflow')
  }
  const data: ApiResponse<{ ticketId: string; workflowPhase: TicketWorkflowPhase }> = await response.json()
  return data.data
}

export async function createTicket(
  ticket: CreateTicketRequest,
  screenshot?: File,
  recording?: File,
): Promise<Ticket> {
  // Build FormData for multipart upload
  const formData = new FormData()
  
  // Add screenshot if provided
  if (screenshot) {
    formData.append('screenshot', screenshot)
  }
  
  // Add recording if provided
  if (recording) {
    formData.append('recording', recording)
  }
  
  // Add ticket fields
  formData.append('projectId', ticket.projectId)
  formData.append('title', ticket.title)
  formData.append('description', ticket.description)
  formData.append('severity', ticket.severity)
  formData.append('category', ticket.category)
  formData.append('autoFixRequested', String(ticket.autoFixRequested))
  
  if (ticket.ticketSystem) {
    formData.append('ticketSystem', ticket.ticketSystem)
  }
  
  // Serialize complex objects as JSON strings
  formData.append('metadata', JSON.stringify(ticket.metadata))
  formData.append('annotations', JSON.stringify(ticket.annotations))
  
  const response = await apiFetch(`${API_BASE_URL}/api/tickets`, {
    method: 'POST',
    // Don't set Content-Type header - browser will set it with boundary for FormData
    body: formData,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to create ticket')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

export async function updateTicket(id: string, updates: UpdateTicketRequest): Promise<Ticket> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update ticket')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

export async function deleteTicket(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to delete ticket')
  }
}

export async function archiveTickets(ticketIds: string[]): Promise<number> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketIds }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to archive tickets')
  }
  const data: ApiResponse<{ updatedCount: number }> = await response.json()
  return data.data.updatedCount
}

export async function unarchiveTickets(ticketIds: string[]): Promise<number> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/unarchive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketIds }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to unarchive tickets')
  }
  const data: ApiResponse<{ updatedCount: number }> = await response.json()
  return data.data.updatedCount
}

export async function getMediaSignedUrl(
  ticketId: string,
  mediaId: string
): Promise<{ signedUrl: string; expiresIn: number }> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/media/${mediaId}/signed-url`)
  if (!response.ok) {
    throw new Error('Failed to get signed URL')
  }
  const data: ApiResponse<{ signedUrl: string; expiresIn: number }> = await response.json()
  return data.data
}

// Phase Document API

export type ApprovalState = 'draft' | 'approval_requested' | 'approved' | 'rejected'

export interface PhaseDocumentResponse {
  id: string
  ticketId: string
  phase: TicketWorkflowPhase
  content: string
  approvalState: ApprovalState
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  updatedAt: string
}

export type PhaseDocumentRevisionSource = 'manual' | 'agent'

export interface PhaseDocumentRevisionResponse {
  id: string
  documentId: string
  ticketId: string
  phase: TicketWorkflowPhase
  content: string
  source: PhaseDocumentRevisionSource
  actor: string | null
  createdAt: string
}

export type PhaseDocumentCommentStatus = 'open' | 'resolved'

export interface PhaseDocumentCommentResponse {
  id: string
  documentId: string
  ticketId: string
  phase: 'research' | 'planning'
  lineNumber: number
  content: string
  status: PhaseDocumentCommentStatus
  actor: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ResearchRunResponse {
  id: string
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  clankerId: string
  clankerName: string | null
  clankerSlug: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface ResearchPhaseResponse {
  document: PhaseDocumentResponse
  latestRun: ResearchRunResponse | null
}

export async function getResearchDocument(ticketId: string): Promise<ResearchPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research`)
  if (!response.ok) {
    if (response.status === 404) throw new Error('Ticket not found')
    throw new Error('Failed to fetch research document')
  }
  const data: ApiResponse<ResearchPhaseResponse> = await response.json()
  return data.data
}

export async function saveResearchDocument(
  ticketId: string,
  content: string,
): Promise<PhaseDocumentResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research/document`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to save research document')
  }
  const data: ApiResponse<PhaseDocumentResponse> = await response.json()
  return data.data
}

export async function getPhaseDocumentRevisions(
  ticketId: string,
  phase: TicketWorkflowPhase,
): Promise<PhaseDocumentRevisionResponse[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/${phase}/revisions`)
  if (!response.ok) {
    if (response.status === 404) throw new Error('Ticket not found')
    throw new Error('Failed to fetch document revisions')
  }
  const data: ApiResponse<PhaseDocumentRevisionResponse[]> = await response.json()
  return data.data
}

export async function getPhaseDocumentComments(
  ticketId: string,
  phase: 'research' | 'planning',
): Promise<PhaseDocumentCommentResponse[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/${phase}/comments`)
  if (!response.ok) {
    if (response.status === 404) throw new Error('Ticket not found')
    throw new Error('Failed to fetch document comments')
  }
  const data: ApiResponse<PhaseDocumentCommentResponse[]> = await response.json()
  return data.data
}

export async function createPhaseDocumentComment(
  ticketId: string,
  phase: 'research' | 'planning',
  payload: { lineNumber: number; content: string },
): Promise<PhaseDocumentCommentResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/${phase}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to create comment')
  }
  const data: ApiResponse<PhaseDocumentCommentResponse> = await response.json()
  return data.data
}

export async function updatePhaseDocumentComment(
  ticketId: string,
  phase: 'research' | 'planning',
  commentId: string,
  payload: { content?: string; status?: PhaseDocumentCommentStatus },
): Promise<PhaseDocumentCommentResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/${phase}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to update comment')
  }
  const data: ApiResponse<PhaseDocumentCommentResponse> = await response.json()
  return data.data
}

export async function runResearch(
  ticketId: string,
  clankerId: string,
  instructionFiles?: Array<{ fileType: string; content: string }>,
): Promise<{ success: boolean; data: { jobId: string; status: string } }> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clankerId, instructionFiles }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to run research')
  }

  return response.json()
}

export async function requestResearchApproval(ticketId: string): Promise<ResearchPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research/request-approval`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to request research approval')
  }
  const data: ApiResponse<ResearchPhaseResponse> = await response.json()
  return data.data
}

export async function approveResearch(ticketId: string): Promise<ResearchPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research/approve`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to approve research')
  }
  const data: ApiResponse<ResearchPhaseResponse> = await response.json()
  return data.data
}

export async function revokeResearchApproval(ticketId: string): Promise<ResearchPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/research/revoke-approval`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to revoke research approval')
  }
  const data: ApiResponse<ResearchPhaseResponse> = await response.json()
  return data.data
}

// Planning Document API

export async function getPlanningDocument(ticketId: string): Promise<PhaseDocumentResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning`)
  if (!response.ok) {
    if (response.status === 404) throw new Error('Ticket not found')
    throw new Error('Failed to fetch planning document')
  }
  const data: ApiResponse<PhaseDocumentResponse> = await response.json()
  return data.data
}

export async function savePlanningDocument(
  ticketId: string,
  content: string,
): Promise<PhaseDocumentResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning/document`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to save planning document')
  }
  const data: ApiResponse<PhaseDocumentResponse> = await response.json()
  return data.data
}

export interface PlanningRunResponse {
  id: string
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  clankerId: string
  clankerName: string | null
  clankerSlug: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface PlanningPhaseResponse {
  document: PhaseDocumentResponse
  latestRun: PlanningRunResponse | null
}

export async function getPlanningPhase(ticketId: string): Promise<PlanningPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning`)
  if (!response.ok) {
    if (response.status === 404) throw new Error('Ticket not found')
    throw new Error('Failed to fetch planning phase')
  }
  const data: ApiResponse<PlanningPhaseResponse> = await response.json()
  return data.data
}

export async function runPlanning(
  ticketId: string,
  clankerId: string,
  instructionFiles?: Array<{ fileType: string; content: string }>,
): Promise<{ success: boolean; data: { jobId: string; status: string } }> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clankerId, instructionFiles }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to run planning')
  }

  return response.json()
}

export async function requestPlanningApproval(ticketId: string): Promise<PlanningPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning/request-approval`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to request planning approval')
  }
  const data: ApiResponse<PlanningPhaseResponse> = await response.json()
  return data.data
}

export async function approvePlanning(ticketId: string): Promise<PlanningPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning/approve`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to approve planning')
  }
  const data: ApiResponse<PlanningPhaseResponse> = await response.json()
  return data.data
}

export async function revokePlanningApproval(ticketId: string): Promise<PlanningPhaseResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/phases/planning/revoke-approval`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to revoke planning approval')
  }
  const data: ApiResponse<PlanningPhaseResponse> = await response.json()
  return data.data
}

export async function overrideTicketWorkflowToExecution(ticketId: string, reason: string): Promise<Ticket> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/workflow/override-to-execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to override ticket workflow')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

// Webhook Status API
export async function getWebhookStatus(): Promise<WebhookStatus> {
  const response = await apiFetch(`${API_BASE_URL}/api/webhooks/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch webhook status')
  }
  const data: ApiResponse<WebhookStatus> = await response.json()
  return data.data
}

// Re-export types for convenience
export type {
  AutoFixStatus,
  Severity,
  Ticket,
  TicketListParams,
  TicketWorkflowPhase,
  UpdateTicketRequest,
} from '@viberglass/types'
