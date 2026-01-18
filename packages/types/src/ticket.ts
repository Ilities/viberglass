/**
 * Ticket and PM integration types
 */

import { TicketSystem } from './common'

// Generic ticket representation across different systems
export interface Ticket {
  id: string
  title: string
  description: string
  status: string
  priority?: string
  assignee?: string
  labels: string[]
  customFields: Record<string, unknown>
  createdAt: string
  updatedAt: string
  url: string
  projectKey?: string
  repositoryUrl?: string
}

// Ticket update payload
export interface TicketUpdate {
  title?: string
  description?: string
  status?: string
  priority?: string
  assignee?: string
  labels?: string[]
  customFields?: Record<string, unknown>
  comment?: string
}

// Webhook event types
export type WebhookEventType = 'ticket_created' | 'ticket_updated' | 'ticket_deleted' | 'comment_added'

// Webhook event representation
export interface WebhookEvent {
  type: WebhookEventType
  ticketId: string
  ticket: Ticket
  changes?: Record<string, unknown>
  timestamp: string
  source: TicketSystem
}

// Webhook status response
export interface WebhookStatus {
  webhooks: Array<{
    event_type: string
    count: number
    processed_count: number
    pending_count: number
  }>
  autoFixQueue: Array<{
    status: string
    count: number
  }>
}

// Manual auto-fix trigger request
export interface TriggerAutoFixRequest {
  ticketId: string
  ticketSystem: string
  repositoryUrl?: string
}
