import type { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import type { ProviderType } from '../WebhookProvider';
import type { JobWithTicket } from './types';
import type { FeedbackProviderBehaviorResolver } from './provider-behaviors';

export interface FeedbackOutboundContext {
  inboundConfigId?: string;
  outboundProvider?: ProviderType;
  externalTicketId?: string;
  externalTicketUrl?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
  jobRepository?: string;
}

export class FeedbackOutboundContextResolver {
  constructor(
    private ticketDAO: TicketDAO,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
  ) {}

  async resolve(job: JobWithTicket): Promise<FeedbackOutboundContext | null> {
    if (!job.ticketId) {
      return null;
    }

    const ticket = await this.ticketDAO.getTicket(job.ticketId);
    if (!ticket) {
      return null;
    }

    const metadata = (ticket.metadata || {}) as unknown as Record<string, unknown>;
    const inboundConfigId =
      typeof metadata.webhookConfigId === 'string' ? metadata.webhookConfigId : undefined;
    const metadataProvider = toWebhookProviderType(
      typeof metadata.provider === 'string' ? metadata.provider : '',
    );
    const ticketProvider = toWebhookProviderType(ticket.ticketSystem);
    const outboundProvider = metadataProvider ?? ticketProvider;
    const behavior = this.providerBehaviors.resolve(outboundProvider);
    const externalTicketId = behavior.resolveExternalTicketId({
      ticketExternalTicketId: ticket.externalTicketId,
      ticketExternalTicketUrl: ticket.externalTicketUrl,
      metadata,
    });

    return {
      inboundConfigId,
      outboundProvider,
      externalTicketId,
      externalTicketUrl: ticket.externalTicketUrl,
      projectId: ticket.projectId,
      metadata,
      jobRepository: job.repository,
    };
  }
}

function toWebhookProviderType(system: string): ProviderType | undefined {
  if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
    return system;
  }
  return undefined;
}
