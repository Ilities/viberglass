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
