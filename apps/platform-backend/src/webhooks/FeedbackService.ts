/**
 * Feedback service for outbound webhook calls
 *
 * Emits outbound job lifecycle events to configured providers when jobs start
 * and finish.
 */

import type { ProviderRegistry } from './registry';
import type { WebhookConfigDAO, WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { WebhookSecretService } from './WebhookSecretService';
import type {
  WebhookProvider,
  WebhookProviderConfig,
  WebhookResult,
  ProviderType,
} from './provider';
import type { JobResult } from '../types/Job';
import { TicketDAO } from '../persistence/ticketing/TicketDAO';
import { createChildLogger } from '../config/logger';
import {
  type OutboundTarget,
  buildProviderProjectCandidates,
  createOutboundTarget,
  filterConfigsByProvider,
  formatJobStartedComment,
  formatResultDetails,
  getRetryDelayMs,
  isTransientProviderError,
  requiresProviderProjectId,
  resolveExternalTicketId,
  selectDeterministicConfig,
  sleep,
} from './feedback-helpers';

/**
 * Job with ticket reference for outbound event posting
 */
export interface JobWithTicket {
  id: string;
  ticketId?: string;
  status: 'active' | 'completed' | 'failed';
  result?: JobResult;
  repository?: string;
}

/**
 * Result of feedback posting attempt
 */
export interface FeedbackResult {
  success: boolean;
  commentPosted?: boolean;
  labelsUpdated?: boolean;
  error?: string;
}

export type OutboundWebhookEventType = 'job_started' | 'job_ended';

/**
 * Feedback service configuration
 */
export interface FeedbackServiceConfig {
  /** Whether to post results even on failure */
  postOnFailure?: boolean;
  /** Default timeout for outbound API calls (ms) */
  timeout?: number;
}

const logger = createChildLogger({ service: 'FeedbackService' });

const GITHUB_MAX_ATTEMPTS = 3;

/**
 * Service for posting outbound webhook events
 */
export class FeedbackService {
  private ticketDAO: TicketDAO;

  constructor(
    private registry: ProviderRegistry,
    private configDAO: WebhookConfigDAO,
    private secretService: WebhookSecretService,
    private config: FeedbackServiceConfig = {}
  ) {
    this.ticketDAO = new TicketDAO();
  }

  /**
   * Compatibility alias for legacy callers.
   * Sends job-ended event with result payload.
   */
  async postJobResult(job: JobWithTicket, result: JobResult): Promise<FeedbackResult> {
    return this.postJobEnded(job, result);
  }

  /**
   * Post job-started event to outbound webhook provider
   */
  async postJobStarted(job: JobWithTicket): Promise<FeedbackResult> {
    return this.postJobEvent(job, 'job_started');
  }

  /**
   * Post job-ended event to outbound webhook provider
   */
  async postJobEnded(job: JobWithTicket, result: JobResult): Promise<FeedbackResult> {
    return this.postJobEvent(job, 'job_ended', result);
  }

  /**
   * Retry posting result for a ticket
   *
   * Manual retry endpoint for failed feedback posts.
   */
  async retryPostResult(ticketId: string): Promise<FeedbackResult> {
    const feedbackResult: FeedbackResult = {
      success: false,
    };

    try {
      const configs = await this.configDAO.listActiveConfigs(1, 0, 'outbound');
      if (!configs[0]) {
        return {
          success: false,
          error: 'No outbound webhook configuration found',
        };
      }

      const config = configs[0];
      const provider = this.registry.get(config.provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${config.provider}' not registered`,
        };
      }

      // Placeholder behavior retained; retry endpoint is not fully wired to ticket metadata.
      feedbackResult.success = true;
      return feedbackResult;
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

  /**
   * Main outbound event poster
   */
  private async postJobEvent(
    job: JobWithTicket,
    eventType: OutboundWebhookEventType,
    result?: JobResult,
  ): Promise<FeedbackResult> {
    const feedbackResult: FeedbackResult = {
      success: false,
    };

    try {
      if (!job.ticketId) {
        return {
          success: true,
          error: 'No ticket associated with job',
        };
      }

      const target = await this.resolveOutboundTarget(job);
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

      if (!this.isEventEnabled(target.config.allowedEvents, eventType)) {
        return {
          success: true,
          error: `Outbound event '${eventType}' is not enabled`,
        };
      }

      if (target.config.provider === 'custom') {
        return {
          success: false,
          error: 'Custom provider does not support outbound posting',
        };
      }

      const provider = this.registry.get(target.config.provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' not registered`,
        };
      }

      const providerConfig = this.toProviderConfig(target.config, target.providerProjectId);

      if (!providerConfig.providerProjectId && requiresProviderProjectId(target.config.provider)) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' outbound configuration requires providerProjectId`,
        };
      }

      const apiToken = await this.secretService.getApiToken(providerConfig);
      if (!apiToken?.trim()) {
        return {
          success: false,
          error: `Provider '${target.config.provider}' API token is missing`,
        };
      }

      const providerWithToken = this.createProviderInstance(provider, {
        ...providerConfig,
        apiToken,
      });

      if (eventType === 'job_started') {
        await this.executeWithRetry({
          provider: target.config.provider,
          eventType,
          job,
          externalTicketId: target.externalTicketId,
          operation: () =>
            providerWithToken.postComment(
              target.externalTicketId!,
              formatJobStartedComment(job.id),
            ),
        });

        feedbackResult.success = true;
        feedbackResult.commentPosted = true;
        feedbackResult.labelsUpdated = false;
        return feedbackResult;
      }

      const webhookResult: WebhookResult = {
        success: result?.success ?? false,
        action: 'comment',
        targetId: target.externalTicketId,
        commitHash: result?.commitHash,
        pullRequestUrl: result?.pullRequestUrl,
        errorMessage: result?.errorMessage,
        details: result ? formatResultDetails(result) : 'Job ended',
      };

      await this.executeWithRetry({
        provider: target.config.provider,
        eventType,
        job,
        externalTicketId: target.externalTicketId,
        operation: () => providerWithToken.postResult(target.externalTicketId!, webhookResult),
      });

      feedbackResult.success = true;
      feedbackResult.commentPosted = true;
      feedbackResult.labelsUpdated = true;

      return feedbackResult;
    } catch (error) {
      logger.error('Failed to post outbound event', {
        eventType,
        jobId: job.id,
        ticketId: job.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve outbound config and external ticket from job/ticket metadata
   */
  private async resolveOutboundTarget(job: JobWithTicket): Promise<OutboundTarget | null> {
    if (!job.ticketId) {
      return null;
    }

    const ticket = await this.ticketDAO.getTicket(job.ticketId);
    if (!ticket) {
      return null;
    }

    const metadata = (ticket.metadata || {}) as unknown as Record<string, unknown>;
    const externalTicketId = resolveExternalTicketId(
      ticket.externalTicketId,
      metadata.externalTicketId,
      metadata.issueKey,
      metadata.issueNumber,
    );

    const metadataWebhookConfigId = metadata.webhookConfigId;
    const inboundConfigId =
      typeof metadataWebhookConfigId === 'string' ? metadataWebhookConfigId : undefined;

    const metadataProvider = this.toWebhookProviderType(
      typeof metadata.provider === 'string' ? metadata.provider : '',
    );
    const ticketProvider = this.toWebhookProviderType(ticket.ticketSystem);
    const outboundProvider = metadataProvider ?? ticketProvider;

    if (inboundConfigId) {
      const inboundConfig = await this.configDAO.getConfigById(inboundConfigId);
      const providerProjectCandidates = buildProviderProjectCandidates(metadata, {
        jobRepository: job.repository,
        inboundProviderProjectId: inboundConfig?.providerProjectId || undefined,
      });

      if (inboundConfig?.integrationId) {
        const outboundIntegrationConfigs = await this.configDAO.listByIntegrationId(
          inboundConfig.integrationId,
          {
            direction: 'outbound',
            activeOnly: true,
          },
        );

        const matchingIntegrationConfig = selectDeterministicConfig(
          filterConfigsByProvider(outboundIntegrationConfigs, outboundProvider),
          providerProjectCandidates,
        );
        if (matchingIntegrationConfig) {
          return createOutboundTarget(
            matchingIntegrationConfig,
            externalTicketId,
            providerProjectCandidates,
          );
        }

        const outboundByIntegration = await this.configDAO.getByIntegrationId(
          inboundConfig.integrationId,
          'outbound',
        );

        if (outboundByIntegration && (!outboundProvider || outboundByIntegration.provider === outboundProvider)) {
          return createOutboundTarget(
            outboundByIntegration,
            externalTicketId,
            providerProjectCandidates,
          );
        }
      }

      if (outboundProvider && outboundProvider !== 'custom') {
        for (const providerProjectId of providerProjectCandidates) {
          const outboundByProviderProject = await this.configDAO.getActiveConfigByProviderProject(
            outboundProvider,
            providerProjectId,
            'outbound',
          );

          if (outboundByProviderProject) {
            return createOutboundTarget(
              outboundByProviderProject,
              externalTicketId,
              providerProjectCandidates,
            );
          }
        }
      }
    }

    const providerProjectCandidates = buildProviderProjectCandidates(metadata, {
      jobRepository: job.repository,
    });

    if (outboundProvider && outboundProvider !== 'custom') {
      for (const providerProjectId of providerProjectCandidates) {
        const outboundFromProviderProject = await this.configDAO.getActiveConfigByProviderProject(
          outboundProvider,
          providerProjectId,
          'outbound',
        );

        if (outboundFromProviderProject) {
          return createOutboundTarget(
            outboundFromProviderProject,
            externalTicketId,
            providerProjectCandidates,
          );
        }
      }
    }

    if (ticket.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        ticket.projectId,
        50,
        0,
        'outbound',
      );

      const matchingProjectConfig = selectDeterministicConfig(
        filterConfigsByProvider(projectConfigs, outboundProvider),
        providerProjectCandidates,
      );

      if (matchingProjectConfig) {
        return createOutboundTarget(
          matchingProjectConfig,
          externalTicketId,
          providerProjectCandidates,
        );
      }
    }

    const fallbacks = await this.configDAO.listActiveConfigs(50, 0, 'outbound');
    const fallbackConfig = selectDeterministicConfig(
      filterConfigsByProvider(fallbacks, outboundProvider),
      providerProjectCandidates,
    );
    if (!fallbackConfig) {
      return null;
    }

    return createOutboundTarget(fallbackConfig, externalTicketId, providerProjectCandidates);
  }

  /**
   * Convert DB config to provider config
   */
  private toProviderConfig(
    dbConfig: WebhookConfig,
    providerProjectId?: string,
  ): WebhookProviderConfig {
    return {
      type: dbConfig.provider,
      secretLocation: dbConfig.secretLocation,
      secretPath: dbConfig.secretPath || undefined,
      algorithm: 'sha256',
      allowedEvents: dbConfig.allowedEvents,
      webhookSecret: dbConfig.webhookSecretEncrypted || undefined,
      apiToken: dbConfig.apiTokenEncrypted || undefined,
      providerProjectId: dbConfig.providerProjectId || providerProjectId || undefined,
    };
  }

  /**
   * Build an isolated provider instance for outbound calls.
   * Avoids mutating the shared registry provider state.
   */
  private createProviderInstance(
    provider: WebhookProvider,
    providerConfig: WebhookProviderConfig,
  ): WebhookProvider {
    const ProviderConstructor = provider.constructor as new (
      config: WebhookProviderConfig,
    ) => WebhookProvider;
    return new ProviderConstructor(providerConfig);
  }

  /**
   * Check outbound event subscription
   */
  private isEventEnabled(allowedEvents: string[] | undefined, event: OutboundWebhookEventType): boolean {
    if (!allowedEvents || allowedEvents.length === 0) {
      return true;
    }

    return allowedEvents.some((allowed) => {
      if (allowed === '*') return true;
      if (allowed === event) return true;
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1);
        return event.startsWith(prefix);
      }
      return false;
    });
  }

  private toWebhookProviderType(system: string): ProviderType | undefined {
    if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
      return system;
    }
    return undefined;
  }

  private async executeWithRetry(params: {
    provider: ProviderType;
    eventType: OutboundWebhookEventType;
    job: JobWithTicket;
    externalTicketId: string;
    operation: () => Promise<void>;
  }): Promise<void> {
    const maxAttempts = params.provider === 'github' ? GITHUB_MAX_ATTEMPTS : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await params.operation();
        return;
      } catch (error) {
        const shouldRetry = attempt < maxAttempts && isTransientProviderError(error);
        if (!shouldRetry) {
          throw error;
        }

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
      }
    }
  }
}
