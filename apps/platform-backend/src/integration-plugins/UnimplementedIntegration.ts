import { BasePMIntegration } from "./BasePMIntegration";
import type {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  TicketSystem,
  WebhookEvent,
} from "@viberglass/types";

export class UnimplementedIntegration extends BasePMIntegration {
  constructor(
    private system: TicketSystem,
    credentials: AuthCredentials,
  ) {
    super(credentials);
  }

  private notImplemented(): never {
    throw new Error(`Integration not implemented: ${this.system}`);
  }

  async authenticate(_credentials: AuthCredentials): Promise<void> {
    return this.notImplemented();
  }

  async createTicket(_ticket: Ticket): Promise<ExternalTicket> {
    return this.notImplemented();
  }

  async updateTicket(
    _ticketId: string,
    _updates: ExternalTicketUpdate,
  ): Promise<void> {
    return this.notImplemented();
  }

  async getTicket(_ticketId: string): Promise<ExternalTicket> {
    return this.notImplemented();
  }

  async registerWebhook(_url: string, _events: string[]): Promise<void> {
    return this.notImplemented();
  }

  handleWebhook(_payload: unknown): WebhookEvent {
    return this.notImplemented();
  }
}
