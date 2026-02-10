import { createChildLogger } from '../../config/logger';
import type { JobResult } from '../../types/Job';
import {
  formatJobStartedComment,
  formatResultDetails,
  type OutboundTarget,
} from '../feedbackHelpers';
import type { WebhookResult } from '../WebhookProvider';
import type { ProviderRegistry } from '../ProviderRegistry';
import type { WebhookSecretService } from '../WebhookSecretService';
import {
  createProviderInstance,
  isEventEnabled,
  toProviderConfig,
} from './FeedbackDispatchUtils';
import { FeedbackOutboundTargetResolver } from './FeedbackOutboundTargetResolver';
import type { FeedbackProviderBehaviorResolver } from './provider-behaviors';
import { FeedbackRetryExecutor } from './FeedbackRetryExecutor';
import type { FeedbackResult, JobWithTicket, OutboundWebhookEventType } from './types';

const logger = createChildLogger({ service: 'FeedbackEventDispatcher' });

export class FeedbackEventDispatcher {
  constructor(
    private registry: ProviderRegistry,
    private secretService: WebhookSecretService,
    private targetResolver: FeedbackOutboundTargetResolver,
    private retryExecutor: FeedbackRetryExecutor,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
  ) {}

  async dispatch(
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<FeedbackResult> {
    let target: OutboundTarget | null = null;

    try {
      if (!job.ticketId) {
        return {
          success: true,
          error: 'No ticket associated with job',
        };
      }

      target = await this.targetResolver.resolve(job);
      if (!target?.config) {
        return {
          success: true,
          error: 'No outbound webhook configuration found for job',
        };
      }

      if (!target.externalTicketId) {
        return {
          success: true,
          error: 'No external ticket ID found',
        };
      }
      const externalTicketId = target.externalTicketId;

      if (!isEventEnabled(target.config.allowedEvents, eventType)) {
        return {
          success: true,
          error: `Outbound event '${eventType}' is not enabled`,
        };
      }

      const behavior = this.providerBehaviors.resolve(target.config.provider);
      if (!behavior.supportsOutboundPosting()) {
        return {
          success: false,
          error: behavior.unsupportedOutboundPostingMessage(target.config.provider),
        };
      }

      const provider = this.registry.get(target.config.provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' not registered`,
        };
      }

      const providerConfig = toProviderConfig(
        target.config,
        target.providerProjectId,
        target.apiBaseUrl,
      );
      if (!providerConfig.providerProjectId && behavior.requiresProviderProjectId()) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' outbound configuration requires providerProjectId`,
        };
      }

      const providerConfigError = behavior.validateProviderConfig(providerConfig);
      if (providerConfigError) {
        return {
          success: false,
          error: providerConfigError,
        };
      }

      const apiToken = await this.secretService.getApiToken(providerConfig);
      if (!apiToken?.trim()) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' API token is missing`,
        };
      }

      const providerWithToken = createProviderInstance(provider, {
        ...providerConfig,
        apiToken,
      });

      if (eventType === 'job_started') {
        await this.retryExecutor.execute({
          provider: target.config.provider,
          maxAttempts: behavior.maxRetryAttempts(),
          eventType,
          job,
          externalTicketId,
          operation: () =>
            providerWithToken.postComment(externalTicketId, formatJobStartedComment(job.id)),
        });

        return {
          success: true,
          commentPosted: true,
          labelsUpdated: false,
        };
      }

      const webhookResult: WebhookResult = {
        success: result?.success ?? false,
        action: 'comment',
        targetId: externalTicketId,
        commitHash: result?.commitHash,
        pullRequestUrl: result?.pullRequestUrl,
        errorMessage: result?.errorMessage,
        details: result ? formatResultDetails(result) : 'Job ended',
      };

      await this.retryExecutor.execute({
        provider: target.config.provider,
        maxAttempts: behavior.maxRetryAttempts(),
        eventType,
        job,
        externalTicketId,
        operation: () => providerWithToken.postResult(externalTicketId, webhookResult),
      });

      return {
        success: true,
        commentPosted: true,
        labelsUpdated: true,
      };
    } catch (error) {
      return createDispatchFailure(error, job, eventType, target);
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
