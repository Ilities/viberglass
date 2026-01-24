import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  CreateTicketRequest,
  PaginatedResponse,
  Ticket,
  TicketListParams,
  UpdateTicketRequest,
  WebhookStatus,
} from '@viberglass/types'

// Tickets API
export async function getTickets(params: TicketListParams = {}): Promise<Ticket[]> {
  const { projectId, projectSlug, limit = 50, offset = 0 } = params
  const query = projectSlug ? `projectSlug=${projectSlug}` : projectId ? `projectId=${projectId}` : ''
  const response = await fetch(`${API_BASE_URL}/api/tickets?${query}&limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch tickets')
  }
  const data: PaginatedResponse<Ticket> = await response.json()
  return data.data
}

export async function getTicket(id: string): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/api/tickets/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ticket not found')
    }
    throw new Error('Failed to fetch ticket')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

export async function createTicket(ticket: CreateTicketRequest): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/api/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ticket),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create ticket')
  }
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}

export async function updateTicket(id: string, updates: UpdateTicketRequest): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/api/tickets/${id}`, {
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
  const response = await fetch(`${API_BASE_URL}/api/tickets/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to delete ticket')
  }
}

export async function getMediaSignedUrl(
  ticketId: string,
  mediaId: string
): Promise<{ signedUrl: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/media/${mediaId}/signed-url`)
  if (!response.ok) {
    throw new Error('Failed to get signed URL')
  }
  const data: ApiResponse<{ signedUrl: string; expiresIn: number }> = await response.json()
  return data.data
}

// Webhook Status API
export async function getWebhookStatus(): Promise<WebhookStatus> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch webhook status')
  }
  const data: ApiResponse<WebhookStatus> = await response.json()
  return data.data
}

// Auto-fix API
export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/trigger-autofix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketId,
      ticketSystem,
      repositoryUrl,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to trigger auto-fix')
  }
}

// Re-export types for convenience
export type { AutoFixStatus, Severity, Ticket, TicketListParams, UpdateTicketRequest } from '@viberglass/types'
