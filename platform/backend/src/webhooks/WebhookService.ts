/**
 * Webhook service orchestration layer
 *
 * Coordinates webhook processing through the provider system:
 * - Provider routing via registry
 * - Signature verification
 * - Deduplication checking
 * - Ticket creation
 * - Optional job execution
 *
 * This is the main entry point for processing incoming webhooks from
 * external platforms like GitHub and Jira.
 */

import type { ParsedWebhookEvent, WebhookProvider, WebhookProviderConfig, WebhookResult } from './provider';
import type { ProviderRegistry } from './registry';
import type { WebhookConfigDAO, WebhookConfig } from '../persistence/webhook/WebhookConfigDAO';
import type { WebhookDeliveryDAO } from '../persistence/webhook/WebhookDeliveryDAO';
import type { DeduplicationService } from './deduplication';
import type { WebhookSecretService } from './WebhookSecretService';
import type { TicketDAO } from '../persistence/ticketing/TicketDAO';
import type { JobService } from '../services/JobService';
import type { CreateTicketRequest, Severity, TicketMetadata, Annotation } from '@viberator/types';
import type { JobData } from '../types/Job';
import { randomUUID } from 'crypto';

/**
 * Extended job context for webhook-originated jobs
 */
interface WebhookJobContext {
  ticketId?: string;
  issueNumber?: number;
  issueUrl?: string;
  issueBody?: string;
  triggeredBy?: string;
  commentBody?: string;
  stepsToReproduce?: string;
}

/**
 * Result of webhook processing
 */
export interface WebhookProcessingResult {
  /** Processing status */
  status: 'processed' | 'ignored' | 'rejected' | 'duplicate' | 'failed';
  /** ID of the ticket created (if any) */
  ticketId?: string;
  /** ID of the job created (if any) */
  jobId?: string;
  /** Reason for the status */
  reason?: string;
  /** Existing delivery ID for duplicates */
  existingId?: string;
}

/**
 * Webhook service configuration
 */
export interface WebhookServiceConfig {
  /** Whether to create jobs automatically when webhook config allows */
  enableAutoExecute?: boolean;
  /** Default tenant ID for webhook-originated resources */
  defaultTenantId?: string;
}

/**
 * Internal event processing result
 */
interface EventProcessingResult {
  ticketId?: string;
  jobId?: string;
  projectId?: string;
}

/**
 * Webhook processing service
 *
 * Orchestrates the complete webhook flow from receiving an event
 * to creating tickets and optionally jobs.
 */
export class WebhookService {
  constructor(
    private registry: ProviderRegistry,
    private configDAO: WebhookConfigDAO,
    private deliveryDAO: WebhookDeliveryDAO,
    private deduplication: DeduplicationService,
    private secretService: WebhookSecretService,
    private ticketDAO: TicketDAO,
    private jobService: JobService,
    private config: WebhookServiceConfig = {}
  ) {}

  /**
   * Process incoming webhook
   *
   * Main orchestration method that handles:
   * 1. Provider routing
   * 2. Event parsing
   * 3. Configuration lookup
   * 4. Signature verification
   * 5. Deduplication check
   * 6. Event processing (ticket creation, optional job creation)
   * 7. Delivery tracking
   *
   * @param headers - HTTP headers from webhook request
   * @param payload - Parsed webhook payload
   * @param rawBody - Raw request body for signature verification
   * @param tenantId - Optional tenant ID (inferred from config if not provided)
   * @returns Processing result with status and created resource IDs
   */
  async processWebhook(
    headers: Record<string, string>,
    payload: unknown,
    rawBody: Buffer,
    tenantId?: string
  ): Promise<WebhookProcessingResult> {
    // 1. Route to provider
    const provider = this.registry.getProviderForHeaders(headers);
    if (!provider) {
      return {
        status: 'ignored',
        reason: 'No matching provider for request headers',
      };
    }

    // 2. Parse event
    let event: ParsedWebhookEvent;
    try {
      event = provider.parseEvent(payload, headers);
    } catch (error) {
      return {
        status: 'ignored',
        reason: `Event parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // 3. Resolve webhook configuration
    const dbConfig = await this.resolveConfig(event);
    if (!dbConfig) {
      return {
        status: 'ignored',
        reason: 'No webhook configuration found for this repository/project',
      };
    }

    if (!dbConfig.active) {
      return {
        status: 'ignored',
        reason: 'Webhook configuration is inactive',
      };
    }

    // Check if event type is allowed
    if (!this.isEventAllowed(event.eventType, dbConfig)) {
      return {
        status: 'ignored',
        reason: `Event type '${event.eventType}' not in allowed list`,
      };
    }

    // Convert DB config to provider config for signature verification
    const providerConfig = this.toProviderConfig(dbConfig, provider.name);

    // 4. Verify signature
    const secret = await this.secretService.getSecret(providerConfig, tenantId);
    const signatureHeader = this.getSignatureHeader(provider.name, headers);
    if (!signatureHeader || !provider.verifySignature(rawBody, signatureHeader, secret)) {
      await this.recordFailedDelivery(event, dbConfig, 'Invalid signature');
      return {
        status: 'rejected',
        reason: 'Invalid signature',
      };
    }

    // 5. Check deduplication
    const { shouldProcess, existingId } = await this.deduplication.shouldProcessDelivery(event.deduplicationId);
    if (!shouldProcess) {
      return {
        status: 'duplicate',
        reason: 'Delivery already processed',
        existingId,
      };
    }

    // 6. Record delivery start
    const delivery = await this.deduplication.recordDeliveryStart({
      provider: provider.name as any,
      deliveryId: event.deduplicationId,
      eventType: event.eventType,
      payload: payload as Record<string, unknown>,
    });

    // 7. Process event
    try {
      const result = await this.processProviderEvent(event, dbConfig, tenantId);

      // 8. Record success
      if (result.ticketId && result.projectId) {
        await this.deduplication.recordDeliverySuccessById(
          delivery.id,
          result.ticketId,
          result.projectId
        );
      } else {
        // No ticket created, just mark as succeeded
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, 'succeeded');
      }

      return {
        status: 'processed',
        ticketId: result.ticketId,
        jobId: result.jobId,
      };
    } catch (error) {
      // Record failure
      await this.deduplication.recordDeliveryFailureById(
        delivery.id,
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get failed webhook deliveries for manual retry
   */
  async getFailedDeliveries(limit = 50): Promise<Awaited<ReturnType<WebhookDeliveryDAO['getPendingDeliveries']>>> {
    return await this.deduplication.getFailedDeliveries(limit);
  }

  /**
   * Retry a failed webhook delivery
   */
  async retryDelivery(deliveryId: string): Promise<WebhookProcessingResult> {
    const delivery = await this.deliveryDAO.getDeliveryByDeliveryId(deliveryId);
    if (!delivery) {
      return {
        status: 'failed',
        reason: 'Delivery not found',
      };
    }

    // Don't retry already successful deliveries
    if (delivery.status === 'succeeded') {
      return {
        status: 'duplicate',
        reason: 'Delivery already succeeded',
        existingId: delivery.id,
      };
    }

    // Get provider
    const provider = this.registry.get(delivery.provider);
    if (!provider) {
      return {
        status: 'failed',
        reason: `Provider '${delivery.provider}' not registered`,
      };
    }

    // Get config
    const dbConfig = await this.resolveConfigFromProvider(delivery.provider);
    if (!dbConfig) {
      return {
        status: 'failed',
        reason: 'Webhook configuration not found',
      };
    }

    // Re-process the event
    try {
      // Parse and process the event
      const event = provider.parseEvent(delivery.payload, {
        'x-github-event': delivery.provider === 'github' ? delivery.eventType : '',
        'x-github-delivery': delivery.deliveryId,
      });

      const result = await this.processProviderEvent(event, dbConfig, undefined);

      // Record success
      if (result.ticketId && result.projectId) {
        await this.deduplication.recordDeliverySuccessById(
          delivery.id,
          result.ticketId,
          result.projectId
        );
      } else {
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, 'succeeded');
      }

      return {
        status: 'processed',
        ticketId: result.ticketId,
        jobId: result.jobId,
      };
    } catch (error) {
      await this.deduplication.recordDeliveryFailureById(
        delivery.id,
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve webhook configuration for an event
   */
  private async resolveConfig(event: ParsedWebhookEvent): Promise<WebhookConfig | null> {
    // Try by repository ID (GitHub) or project ID (Jira)
    if (event.metadata.repositoryId) {
      const config = await this.configDAO.getActiveConfigByProviderProject(
        'github',
        event.metadata.repositoryId
      );
      if (config) return config;
    }

    // Try by project ID from metadata
    if (event.metadata.projectId) {
      const config = await this.configDAO.getConfigByProjectId(event.metadata.projectId);
      if (config) return config;
    }

    return null;
  }

  /**
   * Resolve webhook configuration by provider type
   */
  private async resolveConfigFromProvider(provider: string): Promise<WebhookConfig | null> {
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
   * Check if event type is allowed by configuration
   */
  private isEventAllowed(eventType: string, config: WebhookConfig): boolean {
    if (!config.allowedEvents || config.allowedEvents.length === 0) {
      return true; // No restriction
    }

    // Check for exact match or wildcard pattern
    return config.allowedEvents.some(allowed => {
      if (allowed === '*') return true;
      if (allowed === eventType) return true;
      // Support wildcard prefixes (e.g., 'issue_*')
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1);
        return eventType.startsWith(prefix);
      }
      return false;
    });
  }

  /**
   * Get signature header for provider
   */
  private getSignatureHeader(providerName: string, headers: Record<string, string>): string | undefined {
    switch (providerName) {
      case 'github':
        return headers['x-hub-signature-256'] || headers['x-hub-signature'];
      case 'jira':
        return headers['x-hub-signature'];
      default:
        return undefined;
    }
  }

  /**
   * Record a failed delivery attempt
   */
  private async recordFailedDelivery(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    reason: string
  ): Promise<void> {
    try {
      const delivery = await this.deduplication.recordDeliveryStart({
        provider: config.provider as any,
        deliveryId: event.deduplicationId,
        eventType: event.eventType,
        payload: event.payload as Record<string, unknown>,
      });
      await this.deduplication.recordDeliveryFailureById(delivery.id, reason);
    } catch {
      // Ignore recording failures
    }
  }

  /**
   * Process provider-specific event
   * Handles ticket creation and optional job execution
   */
  private async processProviderEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    switch (event.provider) {
      case 'github':
        return await this.processGitHubEvent(event, config, tenantId);

      case 'jira':
        // Jira support to be implemented
        return result;

      default:
        return result;
    }
  }

  /**
   * Create minimal ticket metadata for webhook-originated tickets
   */
  private createTicketMetadata(baseData: Record<string, unknown>): TicketMetadata {
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...baseData,
    };
  }

  /**
   * Process GitHub webhook event
   */
  private async processGitHubEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    // Resolve tenant ID
    const resolvedTenantId = tenantId || this.config.defaultTenantId || config.projectId || 'default';
    result.projectId = resolvedTenantId;

    // Handle issues events
    if (event.eventType === 'issues') {
      const payload = event.payload as {
        action?: string;
        issue?: {
          number: number;
          title: string;
          body?: string;
          html_url: string;
          user: { login: string };
          state: string;
        };
        repository?: {
          full_name: string;
          owner: { login: string };
          name: string;
        };
        sender?: {
          login: string;
        };
      };

      // Only process 'opened' action for ticket creation
      if (payload?.action === 'opened' && payload?.issue) {
        // Determine severity based on issue labels/content
        let severity: Severity = 'low';
        const labels = (payload.issue as any).labels as Array<{ name: string }> | undefined;
        if (labels) {
          const labelNames = labels.map(l => l.name.toLowerCase());
          if (labelNames.some(l => l.includes('critical') || l.includes('urgent'))) {
            severity = 'critical';
          } else if (labelNames.some(l => l.includes('high') || l.includes('important'))) {
            severity = 'high';
          } else if (labelNames.some(l => l.includes('medium'))) {
            severity = 'medium';
          }
        }

        // Create ticket
        const ticketRequest: CreateTicketRequest = {
          projectId: resolvedTenantId,
          title: payload.issue.title,
          description: payload.issue.body || '',
          severity,
          category: 'bug',
          metadata: this.createTicketMetadata({
            externalTicketId: String(payload.issue.number),
            externalTicketUrl: payload.issue.html_url,
            webhookConfigId: config.id,
            provider: 'github',
            repository: payload.repository?.full_name,
            sender: payload.sender?.login,
            issueState: payload.issue.state,
          }),
          annotations: [],
          autoFixRequested: config.autoExecute,
          ticketSystem: 'github',
        };

        const ticket = await this.ticketDAO.createTicket(ticketRequest);
        result.ticketId = ticket.id;

        // Create job if auto_execute is enabled
        if (config.autoExecute) {
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueNumber: payload.issue.number,
            issueUrl: payload.issue.html_url,
            issueBody: payload.issue.body,
            stepsToReproduce: `Issue URL: ${payload.issue.html_url}\nIssue number: ${payload.issue.number}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: payload.repository?.full_name || '',
            task: `Fix issue: ${payload.issue.title}`,
            context: webhookContext as any, // WebhookJobContext extends JobData['context']
            settings: {
              runTests: true,
            },
            timestamp: Date.now(),
          };

          const jobResult = await this.jobService.submitJob(jobData, {
            ticketId: ticket.id,
          });
          result.jobId = jobResult.jobId;
        }
      }
    }

    // Handle issue_comment events
    if (event.eventType === 'issue_comment') {
      const payload = event.payload as {
        action?: string;
        issue?: {
          number: number;
          title: string;
          body?: string;
        };
        comment?: {
          id: number;
          body?: string;
          user: { login: string };
          created_at: string;
          updated_at: string;
        };
        repository?: {
          full_name: string;
        };
        sender?: {
          login: string;
        };
      };

      // Check if comment mentions bot and contains trigger keywords
      if (config.botUsername && payload?.comment) {
        const commentBody = payload.comment.body?.toLowerCase() || '';
        const mentionsBot = commentBody.includes(`@${config.botUsername}`) ||
                           commentBody.includes(config.botUsername.toLowerCase());

        const hasTriggerKeyword =
          commentBody.includes('fix this') ||
          commentBody.includes('fix it') ||
          commentBody.includes('auto fix') ||
          commentBody.includes('autofix');

        if (mentionsBot && hasTriggerKeyword) {
          // Create ticket
          const ticketRequest: CreateTicketRequest = {
            projectId: resolvedTenantId,
            title: payload.issue?.title || `Issue ${payload.issue?.number}`,
            description: payload.comment?.body || '',
            severity: 'medium',
            category: 'bug',
            metadata: this.createTicketMetadata({
              externalTicketId: String(payload.issue?.number),
              webhookConfigId: config.id,
              provider: 'github',
              repository: payload.repository?.full_name,
              commentId: payload.comment.id.toString(),
              triggeredByComment: true,
              sender: payload.sender?.login,
            }),
            annotations: [],
            autoFixRequested: true,
            ticketSystem: 'github',
          };

          const ticket = await this.ticketDAO.createTicket(ticketRequest);
          result.ticketId = ticket.id;

          // Always create job for bot-triggered requests
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueNumber: payload.issue?.number,
            triggeredBy: 'bot-command',
            commentBody: payload.comment?.body?.substring(0, 500),
            stepsToReproduce: `Triggered by bot comment: ${payload.comment?.body?.substring(0, 200)}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: payload.repository?.full_name || '',
            task: `Fix issue: ${payload.issue?.title}`,
            context: webhookContext as any, // WebhookJobContext extends JobData['context']
            settings: {
              runTests: true,
            },
            timestamp: Date.now(),
          };

          const jobResult = await this.jobService.submitJob(jobData, {
            ticketId: ticket.id,
          });
          result.jobId = jobResult.jobId;
        }
      }
    }

    return result;
  }
}
