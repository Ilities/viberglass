import { createChildLogger } from '../config/logger';
import type { WebhookConfigDAO } from '../persistence/webhook/WebhookConfigDAO';
import type { JobResult } from '../types/Job';
import { FeedbackEventDispatcher } from './feedback/FeedbackEventDispatcher';
import type {
  FeedbackResult,
  FeedbackServiceConfig,
  JobWithTicket,
} from './feedback/types';
import type { ProviderRegistry } from './ProviderRegistry';

export type {
  FeedbackResult,
  FeedbackServiceConfig,
  JobWithTicket,
  OutboundWebhookEventType,
} from './feedback/types';

const logger = createChildLogger({ service: 'FeedbackService' });

export class FeedbackService {
  constructor(
    private registry: ProviderRegistry,
    private configDAO: WebhookConfigDAO,
    private eventDispatcher: FeedbackEventDispatcher,
    private config: FeedbackServiceConfig = {},
  ) {}

  async postJobResult(job: JobWithTicket, result: JobResult): Promise<FeedbackResult> {
    return this.postJobEnded(job, result);
  }

  async postJobStarted(job: JobWithTicket): Promise<FeedbackResult> {
    return this.eventDispatcher.dispatch(job, 'job_started');
  }

  async postJobEnded(job: JobWithTicket, result: JobResult): Promise<FeedbackResult> {
    return this.eventDispatcher.dispatch(job, 'job_ended', result);
  }

  async retryPostResult(ticketId: string): Promise<FeedbackResult> {
    try {
      const configs = await this.configDAO.listActiveConfigs(1, 0, 'outbound');
      if (!configs[0]) {
        return {
          success: false,
          error: 'No outbound webhook configuration found',
        };
      }

      const provider = this.registry.get(configs[0].provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${configs[0].provider}' not registered`,
        };
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to retry result for ticket', {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
