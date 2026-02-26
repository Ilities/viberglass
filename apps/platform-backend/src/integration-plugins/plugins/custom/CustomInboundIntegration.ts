import { BasePMIntegration } from "../../BasePMIntegration";
import type {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from "@viberglass/types";

/**
 * Custom inbound integration for receiving tickets via webhook.
 *
 * This is an inbound-only integration. Outbound methods (createTicket,
 * updateTicket, etc.) throw errors because external ticket creation
 * is not supported - tickets flow inward from external systems.
 */
export class CustomInboundIntegration extends BasePMIntegration {
  constructor(credentials: AuthCredentials) {
    super(credentials);
  }

  async authenticate(_credentials: AuthCredentials): Promise<void> {
    // No authentication needed for inbound-only integration
  }

  async createTicket(_ticket: Ticket): Promise<ExternalTicket> {
    throw new Error("Custom inbound integration does not support creating external tickets");
  }

  async updateTicket(_ticketId: string, _updates: ExternalTicketUpdate): Promise<void> {
    throw new Error("Custom inbound integration does not support updating external tickets");
  }

  async getTicket(_ticketId: string): Promise<ExternalTicket> {
    throw new Error("Custom inbound integration does not support fetching external tickets");
  }

  async registerWebhook(_url: string, _events: string[]): Promise<void> {
    // Webhook registration is manual for custom integrations
  }

  handleWebhook(payload: unknown): WebhookEvent {
    const data = payload as {
      title?: string;
      description?: string;
      severity?: string;
      category?: string;
      externalId?: string;
      url?: string;
    };

    if (!data.title || !data.description) {
      throw new Error("Webhook payload must include title and description");
    }

    return {
      type: "ticket_created",
      ticketId: data.externalId || "",
      ticket: {
        id: data.externalId || "",
        title: data.title,
        description: data.description,
        status: "open",
        priority: data.severity || "medium",
        labels: data.category ? [data.category] : ["bug"],
        customFields: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: data.url || "",
      },
      timestamp: new Date().toISOString(),
      source: "custom",
    };
  }
}
