import type {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from '@viberglass/types'

export type { AuthCredentials, ExternalTicket, ExternalTicketUpdate, Ticket, WebhookEvent }

export interface CustomFieldMapping {
  [key: string]: unknown
}

export interface PMIntegration {
  authenticate(credentials: AuthCredentials): Promise<void>
  createTicket(ticket: Ticket): Promise<ExternalTicket>
  updateTicket(ticketId: string, updates: ExternalTicketUpdate): Promise<void>
  getTicket(ticketId: string): Promise<ExternalTicket>
  hasAutoFixTag(ticket: ExternalTicket): boolean
  mapCustomFields(ticket: Ticket): CustomFieldMapping
  registerWebhook(url: string, events: string[]): Promise<void>
  handleWebhook(payload: unknown): WebhookEvent
}

export interface AutoFixDetectionConfig {
  labelMatching: string[]
  customFields: Record<string, unknown>
  titlePrefixes: string[]
  descriptionMarkers: string[]
  projectSettings: {
    enableForAllBugs: boolean
    enableForSeverity: string[]
  }
}
