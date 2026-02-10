/**
 * Custom inbound event processor
 *
 * Handles custom webhook ticket_created events.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from '../InboundEventProcessorResolver';
import type { ParsedWebhookEvent, ProviderType } from '../WebhookProvider';
import type { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import type { Severity, TicketMetadata, Annotation } from '@viberglass/types';

interface CustomTicketPayload {
  title: string;
  description: string;
  severity?: string;
  category?: string;
  externalId?: string;
  url?: string;
}

export class CustomInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | 'default' = 'custom';

  constructor(private ticketDAO: TicketDAO) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === 'custom';
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, tenantId, defaultTenantId } = context;
    const result: EventProcessingResult = {};

    if (!tenantId && !config.projectId) {
      throw new Error('No project linked to this webhook configuration');
    }

    const resolvedTenantId =
      tenantId || config.projectId || defaultTenantId || 'default';
    result.projectId = resolvedTenantId;

    if (event.eventType !== 'ticket_created') {
      return result;
    }

    const payload = event.payload as CustomTicketPayload;

    const severityCandidates: Severity[] = ['low', 'medium', 'high', 'critical'];
    const severity = severityCandidates.includes(payload.severity as Severity)
      ? (payload.severity as Severity)
      : 'medium';

    const ticket = await this.ticketDAO.createTicket({
      projectId: resolvedTenantId,
      title: payload.title,
      description: payload.description,
      severity,
      category: payload.category || 'bug',
      metadata: this.createTicketMetadata({
        externalTicketId: payload.externalId,
        externalTicketUrl: payload.url,
        webhookConfigId: config.id,
        provider: 'custom',
      }),
      annotations: [] as Annotation[],
      ticketSystem: 'custom',
      autoFixRequested: config.autoExecute,
    });
    result.ticketId = ticket.id;

    if (payload.externalId || payload.url) {
      await this.ticketDAO.updateTicket(ticket.id, {
        externalTicketId: payload.externalId || undefined,
        externalTicketUrl: payload.url || undefined,
      });
    }

    return result;
  }

  private createTicketMetadata(baseData: Record<string, unknown>): TicketMetadata {
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...baseData,
    };
  }
}
