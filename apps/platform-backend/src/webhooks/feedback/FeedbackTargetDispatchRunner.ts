import { createChildLogger } from '../../config/logger';
import type { JobResult } from '../../types/Job';
import { formatJobStartedComment, formatResultDetails, type OutboundTarget } from '../feedbackHelpers';
import type { ProviderRegistry } from '../ProviderRegistry';
import type { WebhookSecretService } from '../WebhookSecretService';
import type { WebhookResult } from '../WebhookProvider';
import { createProviderInstance, toProviderConfig } from './FeedbackDispatchUtils';
import { CustomOutboundTargetDispatcher } from './CustomOutboundTargetDispatcher';
import { FeedbackDeliveryTracker } from './FeedbackDeliveryTracker';
import { readCustomOutboundTargetConfig } from './customOutboundTargetConfig';
import { FeedbackRetryExecutor } from './FeedbackRetryExecutor';
import type { FeedbackProviderBehavior, FeedbackProviderBehaviorResolver } from './provider-behaviors';
import type { JobWithTicket, OutboundWebhookEventType } from './types';

const logger = createChildLogger({ service: 'FeedbackTargetDispatchRunner' });

export class FeedbackTargetDispatchRunner {
  constructor(
    private registry: ProviderRegistry,
    private secretService: WebhookSecretService,
    private retryExecutor: FeedbackRetryExecutor,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
    private customDispatcher: CustomOutboundTargetDispatcher,
    private deliveryTracker: FeedbackDeliveryTracker,
  ) {}

  async dispatchToTarget(
    target: OutboundTarget,
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<{ skipped?: boolean; error?: string }> {
    const behavior = this.providerBehaviors.resolve(target.config.provider);
    if (!behavior.supportsOutboundPosting()) {
      return { error: behavior.unsupportedOutboundPostingMessage(target.config.provider) };
    }

    if (behavior.requiresExternalTicketId() && !target.externalTicketId) {
      return { skipped: true, error: 'No external ticket ID found' };
    }

    const deliveryId = await this.deliveryTracker.trackStart({
      provider: target.config.provider,
      webhookConfigId: target.config.id,
      eventType,
      payload: this.createTrackingPayload(target, job, eventType),
    });

    try {
      if (target.config.provider === 'custom') {
        await this.dispatchCustomTarget(target, job, eventType, result);
      } else {
        await this.dispatchProviderTarget(target, behavior, job, eventType, result);
      }
      await this.deliveryTracker.trackSuccess(deliveryId);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deliveryTracker.trackFailure(deliveryId, message);
      this.logTargetDispatchFailure(error, job, eventType, target);
      return { error: message };
    }
  }

  private async dispatchCustomTarget(
    target: OutboundTarget,
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<void> {
    const targetConfig = readCustomOutboundTargetConfig(target.config.outboundTargetConfig || null);
    if (!targetConfig) {
      throw new Error('Custom outbound target configuration is missing or invalid');
    }

    const externalTicketId = target.externalTicketId || job.ticketId || target.config.id;
    await this.retryExecutor.execute({
      provider: 'custom',
      maxAttempts: targetConfig.retryPolicy.maxAttempts,
      baseDelayMs: targetConfig.retryPolicy.backoffMs,
      maxDelayMs: targetConfig.retryPolicy.maxBackoffMs,
      eventType,
      job,
      externalTicketId,
      operation: async () => {
        await this.customDispatcher.dispatch({
          target: targetConfig,
          eventType,
          job,
          result,
        });
      },
    });
  }

  private async dispatchProviderTarget(
    target: OutboundTarget,
    behavior: FeedbackProviderBehavior,
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<void> {
    const provider = this.registry.get(target.config.provider);
    if (!provider) {
      throw new Error(`Provider '${target.config.provider}' not registered`);
    }

    const providerConfig = toProviderConfig(
      target.config,
      target.providerProjectId,
      target.apiBaseUrl,
    );
    if (!providerConfig.providerProjectId && behavior.requiresProviderProjectId()) {
      throw new Error(
        `Provider '${target.config.provider}' outbound configuration requires providerProjectId`,
      );
    }

    const providerConfigError = behavior.validateProviderConfig(providerConfig);
    if (providerConfigError) {
      throw new Error(providerConfigError);
    }

    const providerConfigWithToken = {
      ...providerConfig,
      apiToken: providerConfig.apiToken,
    };

    if (behavior.requiresApiToken()) {
      const apiToken = await this.secretService.getApiToken(providerConfig);
      if (!apiToken?.trim()) {
        throw new Error(`Provider '${target.config.provider}' API token is missing`);
      }
      providerConfigWithToken.apiToken = apiToken;
    }

    const providerWithToken = createProviderInstance(provider, providerConfigWithToken);
    const externalTicketId = target.externalTicketId || job.ticketId || target.config.id;

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
      return;
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
  }

  private createTrackingPayload(
    target: OutboundTarget,
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
  ): Record<string, unknown> {
    return {
      direction: 'outbound',
      eventType,
      jobId: job.id,
      ticketId: job.ticketId || null,
      provider: target.config.provider,
      webhookConfigId: target.config.id,
      externalTicketId: target.externalTicketId || null,
    };
  }

  private logTargetDispatchFailure(
    error: unknown,
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    target: OutboundTarget,
  ): void {
    logger.error('Failed to post outbound event for target', {
      eventType,
      jobId: job.id,
      ticketId: job.ticketId,
      provider: target.config.provider,
      webhookConfigId: target.config.id,
      externalTicketId: target.externalTicketId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
