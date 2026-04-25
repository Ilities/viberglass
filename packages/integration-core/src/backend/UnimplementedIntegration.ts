import type {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from '@viberglass/types'
import type { TicketSystem } from '@viberglass/types'
import { BasePMIntegration } from './BasePMIntegration'

export class UnimplementedIntegration extends BasePMIntegration {
  private readonly systemId: string

  constructor(systemId: TicketSystem, credentials: AuthCredentials) {
    super(credentials)
    this.systemId = systemId
  }

  async authenticate(_credentials: AuthCredentials): Promise<void> {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }

  async createTicket(_ticket: Ticket): Promise<ExternalTicket> {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }

  async updateTicket(_ticketId: string, _updates: ExternalTicketUpdate): Promise<void> {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }

  async getTicket(_ticketId: string): Promise<ExternalTicket> {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }

  async registerWebhook(_url: string, _events: string[]): Promise<void> {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }

  handleWebhook(_payload: unknown): WebhookEvent {
    throw new Error(`Integration not implemented: ${this.systemId}`)
  }
}
