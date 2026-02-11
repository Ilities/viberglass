import { createChildLogger } from '../../config/logger';
import type { JobResult } from '../../types/Job';
import type { OutboundTarget } from '../feedbackHelpers';
import { isEventEnabled } from './FeedbackDispatchUtils';
import { FeedbackOutboundTargetResolver } from './FeedbackOutboundTargetResolver';
import { FeedbackTargetDispatchRunner } from './FeedbackTargetDispatchRunner';
import type { FeedbackResult, JobWithTicket, OutboundWebhookEventType } from './types';

const logger = createChildLogger({ service: 'FeedbackEventDispatcher' });

export class FeedbackEventDispatcher {
  constructor(
    private targetResolver: FeedbackOutboundTargetResolver,
    private targetRunner: FeedbackTargetDispatchRunner,
  ) {}

  async dispatch(
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<FeedbackResult> {
    try {
      if (!job.ticketId) {
        return {
          success: true,
          error: 'No ticket associated with job',
        };
      }

      const targets = await this.targetResolver.resolveAll(job);
      if (targets.length === 0) {
        return {
          success: true,
          error: 'No outbound webhook configuration found for job',
        };
      }

      const enabledTargets = targets.filter((target) =>
        isEventEnabled(target.config.allowedEvents, eventType),
      );
      if (enabledTargets.length === 0) {
        return {
          success: true,
          error: `Outbound event '${eventType}' is not enabled for any target`,
        };
      }

      let successCount = 0;
      const failures: string[] = [];
      const skippedReasons: string[] = [];

      for (const target of enabledTargets) {
        const dispatchOutcome = await this.targetRunner.dispatchToTarget(
          target,
          job,
          eventType,
          result,
        );
        if (dispatchOutcome.skipped) {
          if (dispatchOutcome.error) {
            skippedReasons.push(dispatchOutcome.error);
          }
          continue;
        }
        if (dispatchOutcome.error) {
          failures.push(dispatchOutcome.error);
          continue;
        }
        successCount += 1;
      }

      if (successCount === 0 && failures.length === 0 && skippedReasons.length > 0) {
        return {
          success: true,
          error: skippedReasons[0],
        };
      }

      if (failures.length === 0) {
        return {
          success: true,
          commentPosted: successCount > 0,
          labelsUpdated: eventType === 'job_ended' && successCount > 0,
        };
      }

      if (successCount > 0) {
        return {
          success: false,
          commentPosted: true,
          labelsUpdated: eventType === 'job_ended',
          error: `${failures.length} outbound target(s) failed; first error: ${failures[0]}`,
        };
      }

      return {
        success: false,
        error: failures[0],
      };
    } catch (error) {
      return createDispatchFailure(error, job, eventType, null);
    }
  }
}

function createDispatchFailure(
  error: unknown,
  job: JobWithTicket,
  eventType: OutboundWebhookEventType,
  target: OutboundTarget | null,
): FeedbackResult {
  logger.error('Failed to post outbound event', {
    eventType,
    jobId: job.id,
    ticketId: job.ticketId,
    provider: target?.config?.provider,
    webhookConfigId: target?.config?.id,
    externalTicketId: target?.externalTicketId,
    error: error instanceof Error ? error.message : String(error),
  });

  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}
