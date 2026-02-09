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

/**
 * Internal resolved outbound target
 */
interface OutboundTarget {
  config: WebhookConfig;
  externalTicketId?: string;
}

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
      console.error(`[FeedbackService] Failed to retry result for ticket ${ticketId}:`, error);

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

      const providerConfig = this.toProviderConfig(target.config, provider.name);
      const apiToken = await this.secretService.getApiToken(providerConfig);
      const providerWithToken = this.updateProviderConfig(
        provider as WebhookProvider & { config?: WebhookProviderConfig },
        providerConfig,
        apiToken,
      );

      if (eventType === 'job_started') {
        await providerWithToken.postComment(
          target.externalTicketId,
          this.formatJobStartedComment(job),
        );
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
        details: result ? this.formatResultDetails(result) : 'Job ended',
      };

      await providerWithToken.postResult(target.externalTicketId, webhookResult);

      feedbackResult.success = true;
      feedbackResult.commentPosted = true;
      feedbackResult.labelsUpdated = true;

      return feedbackResult;
    } catch (error) {
      console.error(
        `[FeedbackService] Failed to post outbound event '${eventType}' for job ${job.id}:`,
        error,
      );

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
    const metadataExternalTicketId = metadata.externalTicketId;
    const externalTicketId =
      ticket.externalTicketId ||
      (typeof metadataExternalTicketId === 'string'
        ? metadataExternalTicketId
        : typeof metadataExternalTicketId === 'number'
          ? String(metadataExternalTicketId)
          : undefined);

    const metadataWebhookConfigId = metadata.webhookConfigId;
    const inboundConfigId =
      typeof metadataWebhookConfigId === 'string' ? metadataWebhookConfigId : undefined;

    if (inboundConfigId) {
      const inboundConfig = await this.configDAO.getConfigById(inboundConfigId);

      if (inboundConfig?.integrationId) {
        const outboundByIntegration = await this.configDAO.getByIntegrationId(
          inboundConfig.integrationId,
          'outbound',
        );

        if (outboundByIntegration) {
          return { config: outboundByIntegration, externalTicketId };
        }
      }

      if (inboundConfig?.providerProjectId) {
        const outboundByProviderProject =
          await this.configDAO.getActiveConfigByProviderProject(
            inboundConfig.provider,
            inboundConfig.providerProjectId,
            'outbound',
          );

        if (outboundByProviderProject) {
          return { config: outboundByProviderProject, externalTicketId };
        }
      }
    }

    if (job.repository) {
      const outboundFromRepository = await this.configDAO.getActiveConfigByProviderProject(
        'github',
        job.repository,
        'outbound',
      );

      if (outboundFromRepository) {
        return { config: outboundFromRepository, externalTicketId };
      }
    }

    const ticketProvider = this.toWebhookProviderType(ticket.ticketSystem);

    if (ticket.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        ticket.projectId,
        20,
        0,
        'outbound',
      );

      const matchingProjectConfig = projectConfigs.find((cfg) => {
        if (!ticketProvider) {
          return true;
        }
        return cfg.provider === ticketProvider;
      });

      if (matchingProjectConfig) {
        return { config: matchingProjectConfig, externalTicketId };
      }
    }

    const fallbacks = await this.configDAO.listActiveConfigs(1, 0, 'outbound');
    if (!fallbacks[0]) {
      return null;
    }

    return {
      config: fallbacks[0],
      externalTicketId,
    };
  }

  /**
   * Convert DB config to provider config
   */
  private toProviderConfig(dbConfig: WebhookConfig, providerName: string): WebhookProviderConfig {
    return {
      type: dbConfig.provider,
      secretLocation: dbConfig.secretLocation,
      secretPath: dbConfig.secretPath || undefined,
      algorithm: 'sha256',
      allowedEvents: dbConfig.allowedEvents,
      webhookSecret: dbConfig.webhookSecretEncrypted || undefined,
      apiToken: dbConfig.apiTokenEncrypted || undefined,
      providerProjectId: dbConfig.providerProjectId || undefined,
    };
  }

  /**
   * Update provider configuration with API token
   */
  private updateProviderConfig(
    provider: WebhookProvider & { config?: WebhookProviderConfig },
    baseConfig: WebhookProviderConfig,
    apiToken: string,
  ): WebhookProvider {
    if (provider.config) {
      provider.config = {
        ...baseConfig,
        apiToken,
      };
    }
    return provider;
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

  /**
   * Build a lightweight started-event comment body
   */
  private formatJobStartedComment(job: JobWithTicket): string {
    return [
      '## 🚀 Job Started',
      '',
      `**Job ID:** ${job.id}`,
      `**Started At:** ${new Date().toISOString()}`,
    ].join('\n');
  }

  /**
   * Format result details for posting
   */
  private formatResultDetails(result: JobResult): string {
    const parts: string[] = [];

    parts.push(`Success: ${result.success}`);

    if (result.executionTime) {
      parts.push(`Execution time: ${result.executionTime}ms`);
    }

    if (result.changedFiles && result.changedFiles.length > 0) {
      parts.push(`Files changed: ${result.changedFiles.length}`);
    }

    if (result.branch) {
      parts.push(`Branch: ${result.branch}`);
    }

    return parts.join('\n') || 'Job completed';
  }

  private toWebhookProviderType(system: string): ProviderType | undefined {
    if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
      return system;
    }
    return undefined;
  }
}
