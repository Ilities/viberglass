import { createChildLogger } from '../../config/logger';
import { getRetryDelayMs, isTransientProviderError, sleep } from '../feedbackHelpers';
import type { ProviderType } from '../WebhookProvider';
import type { JobWithTicket, OutboundWebhookEventType } from './types';

const logger = createChildLogger({ service: 'FeedbackRetryExecutor' });

interface RetryParams {
  provider: ProviderType;
  maxAttempts: number;
  eventType: OutboundWebhookEventType;
  job: JobWithTicket;
  externalTicketId: string;
  operation: () => Promise<void>;
}

export class FeedbackRetryExecutor {
  async execute(params: RetryParams): Promise<void> {
    const maxAttempts = Math.max(1, params.maxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await params.operation();
        return;
      } catch (error) {
        const transientFailure = isTransientProviderError(error);
        const shouldRetry = attempt < maxAttempts && transientFailure;
        if (shouldRetry) {
          const delayMs = getRetryDelayMs(attempt);
          logger.warn('Transient outbound provider failure; retrying', {
            provider: params.provider,
            eventType: params.eventType,
            jobId: params.job.id,
            ticketId: params.job.ticketId,
            externalTicketId: params.externalTicketId,
            attempt,
            maxAttempts,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          });

          await sleep(delayMs);
          continue;
        }

        if (transientFailure && maxAttempts === 1) {
          logger.warn('Transient outbound provider failure; retry skipped for retry-safe dispatch', {
            provider: params.provider,
            eventType: params.eventType,
            jobId: params.job.id,
            ticketId: params.job.ticketId,
            externalTicketId: params.externalTicketId,
            attempt,
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        logger.error('Outbound provider operation failed', {
          provider: params.provider,
          eventType: params.eventType,
          jobId: params.job.id,
          ticketId: params.job.ticketId,
          externalTicketId: params.externalTicketId,
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    }
  }
}
