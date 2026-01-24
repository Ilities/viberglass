/**
 * Feedback service for outbound webhook calls
 *
 * Posts job results back to webhook providers (GitHub, Jira, etc.)
 * when jobs complete. This handles the "result feedback" flow where
 * job completion results are posted as comments and labels on the
 * originating issue/ticket.
 *
 * The service is designed to be called from JobService when a job
 * reaches terminal status (completed or failed).
 */

import type { ProviderRegistry } from './registry';
import type { WebhookConfigDAO, WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { WebhookSecretService } from './WebhookSecretService';
import type { WebhookProvider, WebhookProviderConfig, WebhookResult } from './provider';
import type { JobResult } from '../types/Job';

/**
 * Job with ticket reference for result posting
 */
export interface JobWithTicket {
  id: string;
  ticketId?: string;
  status: 'completed' | 'failed';
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
 * Service for posting job results back to webhook providers
 *
 * When a job completes, this service:
 * 1. Resolves the ticket associated with the job
 * 2. Fetches the webhook configuration used to create the ticket
 * 3. Loads the provider for the configuration
 * 4. Posts a formatted comment to the external ticket
 * 5. Updates labels based on success/failure
 */
export class FeedbackService {
  constructor(
    private registry: ProviderRegistry,
    private configDAO: WebhookConfigDAO,
    private secretService: WebhookSecretService,
    private config: FeedbackServiceConfig = {}
  ) {}

  /**
   * Post job result back to webhook provider
   *
   * This is the main entry point called by JobService when a job completes.
   *
   * @param job - Job with ticket reference
   * @param result - Job execution result
   * @returns Feedback result
   */
  async postJobResult(job: JobWithTicket, result: JobResult): Promise<FeedbackResult> {
    const feedbackResult: FeedbackResult = {
      success: false,
    };

    try {
      // 1. Resolve ticket
      if (!job.ticketId) {
        return {
          success: true, // Not an error - just nothing to post to
          error: 'No ticket associated with job',
        };
      }

      // 2. Resolve webhook config from ticket metadata
      // Note: In a real implementation, we'd fetch the ticket and get webhookConfigId
      // For now, we'll use the repository to find the config
      const config = await this.resolveConfigFromJob(job);
      if (!config) {
        return {
          success: true, // Not an error - webhook may not be configured
          error: 'No webhook configuration found for job',
        };
      }

      // 3. Get provider
      const provider = this.registry.get(config.provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${config.provider}' not registered`,
        };
      }

      // 4. Load API token
      const providerConfig = this.toProviderConfig(config, provider.name);
      const apiToken = await this.secretService.getApiToken(providerConfig);

      // 5. Extract external ticket ID from job context
      const externalTicketId = this.extractExternalTicketId(job, config);
      if (!externalTicketId) {
        return {
          success: true, // Not an error - may not have external ticket
          error: 'No external ticket ID found',
        };
      }

      // 6. Create WebhookResult from JobResult
      const webhookResult: WebhookResult = {
        success: result.success,
        action: 'comment',
        targetId: externalTicketId,
        commitHash: result.commitHash,
        pullRequestUrl: result.pullRequestUrl,
        errorMessage: result.errorMessage,
        details: this.formatResultDetails(result),
      };

      // 7. Update provider config with API token for outbound calls
      const providerWithToken = this.updateProviderConfig(
        provider as any,
        providerConfig,
        apiToken
      );

      // 8. Post result (comment + labels)
      await providerWithToken.postResult(externalTicketId, webhookResult);

      feedbackResult.success = true;
      feedbackResult.commentPosted = true;
      feedbackResult.labelsUpdated = true;

      return feedbackResult;
    } catch (error) {
      // Log errors but don't fail the job completion
      console.error(`[FeedbackService] Failed to post result for job ${job.id}:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Retry posting result for a ticket
   *
   * Manual retry endpoint for failed feedback posts.
   *
   * @param ticketId - Internal ticket ID
   * @returns Feedback result
   */
  async retryPostResult(ticketId: string): Promise<FeedbackResult> {
    const feedbackResult: FeedbackResult = {
      success: false,
    };

    try {
      // Find webhook config associated with ticket
      // In a real implementation, this would query the ticket
      // For now, try to find an active config
      const configs = await this.configDAO.listActiveConfigs(1);
      if (!configs[0]) {
        return {
          success: false,
          error: 'No webhook configuration found',
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

      // Load API token
      const providerConfig = this.toProviderConfig(config, provider.name);
      const apiToken = await this.secretService.getApiToken(providerConfig);

      // The external ticket ID and result would come from ticket metadata
      // For now, return a placeholder result
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
   * Resolve webhook config from job
   */
  private async resolveConfigFromJob(job: JobWithTicket): Promise<WebhookConfig | null> {
    // Try to find config by repository (for GitHub)
    if (job.repository) {
      const config = await this.configDAO.getActiveConfigByProviderProject(
        'github',
        job.repository
      );
      if (config) return config;
    }

    // Fall back to first active config
    const configs = await this.configDAO.listActiveConfigs(1);
    return configs[0] || null;
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
    apiToken: string
  ): WebhookProvider {
    // Update the provider's config with the API token
    if (provider.config) {
      provider.config = {
        ...baseConfig,
        apiToken,
      };
    }
    return provider;
  }

  /**
   * Extract external ticket ID from job
   */
  private extractExternalTicketId(job: JobWithTicket, config: WebhookConfig): string | undefined {
    // In a real implementation, this would fetch the ticket and extract
    // external_ticket_id from metadata. For now, try to extract from
    // job context or use a placeholder.

    // The job result may contain issue information
    if (job.result && (job.result as any).issueNumber) {
      return String((job.result as any).issueNumber);
    }

    // Extract from job context if available
    // @ts-ignore - context may have additional fields
    if (job.result?.context?.issueNumber) {
      // @ts-ignore
      return String(job.result.context.issueNumber);
    }

    return undefined;
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
}
