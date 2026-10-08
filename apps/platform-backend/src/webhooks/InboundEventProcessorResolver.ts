/**
 * Inbound event processor interface and resolver
 *
 * Defines the strategy pattern contract for processing inbound webhook events
 * from different providers. Trackers read their payloads into a linked task's
 * events; a custom webhook creates a task and can have its plan written.
 */

import type { ParsedWebhookEvent, ProviderType } from './WebhookProvider';
import type { WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { TicketDAO } from '../persistence/ticketing/TicketDAO';
import type { TrackerIssueInbound } from '../services/trackers/TrackerIssueInbound';
import type { WebhookPlanRequester } from './WebhookPlanRequester';
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
 * Each processor reads its provider's event format and acts on the task it's about.
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
  planner: Pick<WebhookPlanRequester, 'request'>,
  issues: Pick<TrackerIssueInbound, 'issue' | 'commented'>,
): InboundEventProcessorResolver {
  return new InboundEventProcessorResolver([
    new DefaultInboundProcessor(),
    new GitHubInboundProcessor(issues),
    new JiraInboundProcessor(issues),
    new ShortcutInboundProcessor(issues),
    new CustomInboundProcessor(ticketDAO, planner),
  ]);
}
