/**
 * Inbound event processor interface and resolver
 *
 * Defines the strategy pattern contract for processing inbound webhook events
 * from different providers. Each processor handles provider-specific logic for
 * creating tickets and optionally asking their agent to build.
 */

import type { ParsedWebhookEvent, ProviderType } from './WebhookProvider';
import type { WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { TicketDAO } from '../persistence/ticketing/TicketDAO';
import type { ProjectIntegrationLinkDAO } from '../persistence/integrations/ProjectIntegrationLinkDAO';
import type { WebhookBuildRequester } from './WebhookBuildRequester';
import { CustomInboundProcessor } from './inbound-processors/CustomInboundProcessor';
import { DefaultInboundProcessor } from './inbound-processors/DefaultInboundProcessor';
import { GitHubInboundProcessor } from './inbound-processors/GitHubInboundProcessor';
import { JiraInboundProcessor } from './inbound-processors/JiraInboundProcessor';
import { ShortcutInboundProcessor } from './inbound-processors/ShortcutInboundProcessor';

/**
 * Context passed to inbound event processors
 */
export interface InboundEventContext {
  /** Parsed webhook event */
  event: ParsedWebhookEvent;
  /** Webhook configuration for this event */
  config: WebhookConfig;
  /** Tenant ID from request context (if any) */
  tenantId?: string;
  /** Default tenant ID from service config */
  defaultTenantId?: string;
}

/**
 * Result of processing an inbound event
 */
export interface EventProcessingResult {
  /** Created ticket ID (if any) */
  ticketId?: string;
  /** Created job ID (if any) */
  jobId?: string;
  /** Resolved project ID */
  projectId?: string;
  /** Reason the event was ignored (if not processed) */
  ignoredReason?: string;
}

/**
 * Interface for provider-specific inbound event processors
 *
 * Each processor handles the logic for creating tickets and asking for builds
 * based on provider-specific event formats and business rules.
 */
export interface InboundEventProcessor {
  /** Provider this processor handles, or 'default' for fallback */
  readonly provider: ProviderType | 'default';

  /**
   * Check if this processor can handle the given event
   * @param event - Parsed webhook event
   * @returns true if this processor should handle the event
   */
  canProcess(event: ParsedWebhookEvent): boolean;

  /**
   * Process the inbound event
   * @param context - Processing context with event, config, and tenant info
   * @returns Processing result with created resource IDs
   */
  process(context: InboundEventContext): Promise<EventProcessingResult>;
}

/**
 * Resolver for selecting the appropriate inbound event processor
 */
export class InboundEventProcessorResolver {
  private readonly defaultProcessor: InboundEventProcessor;
  private readonly processors = new Map<ProviderType, InboundEventProcessor>();

  constructor(processors: InboundEventProcessor[]) {
    const defaultProcessor = processors.find((p) => p.provider === 'default');
    if (!defaultProcessor) {
      throw new Error('InboundEventProcessorResolver requires a default processor');
    }

    this.defaultProcessor = defaultProcessor;
    for (const processor of processors) {
      if (processor.provider === 'default') {
        continue;
      }
      this.processors.set(processor.provider, processor);
    }
  }

  /**
   * Resolve the processor for a given provider
   * @param provider - Provider type to resolve
   * @returns The processor for the provider, or the default processor
   */
  resolve(provider: ProviderType | undefined): InboundEventProcessor {
    if (!provider) {
      return this.defaultProcessor;
    }
    return this.processors.get(provider) ?? this.defaultProcessor;
  }
}

/**
 * Create the default resolver with all provider processors
 */
export function createDefaultInboundEventProcessorResolver(
  ticketDAO: TicketDAO,
  builds: Pick<WebhookBuildRequester, 'request'>,
  projectIntegrationLinkDAO: ProjectIntegrationLinkDAO,
): InboundEventProcessorResolver {
  return new InboundEventProcessorResolver([
    new DefaultInboundProcessor(),
    new GitHubInboundProcessor(ticketDAO, builds),
    new JiraInboundProcessor(ticketDAO, builds),
    new ShortcutInboundProcessor(ticketDAO, builds, projectIntegrationLinkDAO),
    new CustomInboundProcessor(ticketDAO),
  ]);
}
