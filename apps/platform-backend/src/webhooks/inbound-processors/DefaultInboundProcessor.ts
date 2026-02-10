/**
 * Default inbound event processor
 *
 * Provides a no-op fallback for events that don't have a specific processor.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from '../InboundEventProcessorResolver';
import type { ParsedWebhookEvent, ProviderType } from '../WebhookProvider';

/**
 * Default processor that handles events without specific processor logic
 */
export class DefaultInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | 'default' = 'default';

  canProcess(_event: ParsedWebhookEvent): boolean {
    return true;
  }

  async process(_context: InboundEventContext): Promise<EventProcessingResult> {
    return {};
  }
}
