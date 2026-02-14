/**
 * Inbound event processor interface and resolver
 *
 * Defines the strategy pattern contract for processing inbound webhook events
 * from different providers. Each processor handles provider-specific logic for
 * creating tickets and optionally submitting jobs.
 */

import type { ParsedWebhookEvent, ProviderType } from './WebhookProvider';
import type { WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { TicketDAO } from '../persistence/ticketing/TicketDAO';
import type { ProjectScmConfigDAO } from '../persistence/project/ProjectScmConfigDAO';
import type { JobService } from '../services/JobService';

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
 * Each processor handles the logic for creating tickets and jobs
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
  jobService: JobService,
  projectScmConfigDAO: ProjectScmConfigDAO,
): InboundEventProcessorResolver {
  // Defer import to avoid circular dependencies
  const { DefaultInboundProcessor } = require('./inbound-processors/DefaultInboundProcessor');
  const { GitHubInboundProcessor } = require('./inbound-processors/GitHubInboundProcessor');
  const { JiraInboundProcessor } = require('./inbound-processors/JiraInboundProcessor');
  const { ShortcutInboundProcessor } = require('./inbound-processors/ShortcutInboundProcessor');
  const { CustomInboundProcessor } = require('./inbound-processors/CustomInboundProcessor');

  return new InboundEventProcessorResolver([
    new DefaultInboundProcessor(),
    new GitHubInboundProcessor(ticketDAO, jobService, projectScmConfigDAO),
    new JiraInboundProcessor(ticketDAO, jobService),
    new ShortcutInboundProcessor(ticketDAO, jobService),
    new CustomInboundProcessor(ticketDAO),
  ]);
}
