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

import type {
  ParsedWebhookEvent,
  WebhookProvider,
  WebhookProviderConfig,
  WebhookResult,
} from "./provider";
import type { ProviderRegistry } from "./registry";
import type {
  WebhookConfigDAO,
  WebhookConfig,
} from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./deduplication";
import type { WebhookSecretService } from "./WebhookSecretService";
import type { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { JobService } from "../services/JobService";
import type {
  CreateTicketRequest,
  Severity,
  TicketMetadata,
  Annotation,
} from "@viberglass/types";
import type { JobData } from "../types/Job";
import { randomUUID } from "crypto";

/**
 * Extended job context for webhook-originated jobs
 */
interface WebhookJobContext {
  ticketId?: string;
  issueNumber?: number;
  issueKey?: string;
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
  status: "processed" | "ignored" | "rejected" | "duplicate" | "failed";
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

export interface WebhookProcessingOptions {
  /** Optional explicit provider override from route context */
  providerName?: "github" | "jira" | "shortcut" | "custom";
  /** Optional direct config lookup hint */
  configId?: string;
  /** Optional integration-scoped lookup hint */
  integrationId?: string;
  /** Optional provider project identifier hint */
  providerProjectId?: string;
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
    private config: WebhookServiceConfig = {},
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
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
    rawBody: Buffer,
    tenantId?: string,
    options: WebhookProcessingOptions = {},
  ): Promise<WebhookProcessingResult> {
    const normalizedHeaders = this.normalizeHeaders(headers);

    // 1. Route to provider
    const provider = options.providerName
      ? this.registry.get(options.providerName)
      : this.registry.getProviderForHeaders(normalizedHeaders);
    if (!provider) {
      return {
        status: "ignored",
        reason: "No matching provider for request headers",
      };
    }

    // 2. Parse event
    let event: ParsedWebhookEvent;
    try {
      event = provider.parseEvent(payload, normalizedHeaders);
    } catch (error) {
      return {
        status: "ignored",
        reason: `Event parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    // 3. Resolve webhook configuration
    const dbConfig = await this.resolveConfig(event, {
      providerName: provider.name as "github" | "jira" | "shortcut" | "custom",
      ...options,
    });
    if (!dbConfig) {
      return {
        status: "ignored",
        reason: "No webhook configuration found for this repository/project",
      };
    }

    if (!dbConfig.active) {
      const reason = `Webhook configuration '${dbConfig.id}' is inactive`;
      await this.recordFailedDelivery(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    // Check if event type is allowed
    if (!this.isEventAllowed(event, dbConfig)) {
      const allowedCandidates = this.getAllowedEventCandidates(event).join(", ");
      const reason = `Event '${allowedCandidates}' not allowed for webhook config '${dbConfig.id}'`;
      await this.recordFailedDelivery(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    // Convert DB config to provider config for signature verification
    const providerConfig = this.toProviderConfig(dbConfig);

    // 4. Verify signature
    const signatureResult = await this.verifySignature({
      provider,
      providerConfig,
      providerName: provider.name,
      headers: normalizedHeaders,
      rawBody,
      tenantId,
    });
    if (!signatureResult.valid) {
      const reason = `Rejected: ${signatureResult.reason ?? "Invalid signature"}`;
      await this.recordFailedDelivery(
        event,
        dbConfig,
        reason,
      );
      return {
        status: "rejected",
        reason: signatureResult.reason ?? "Invalid signature",
      };
    }

    // 5. Check deduplication
    const { shouldProcess, existingId } =
      await this.deduplication.shouldProcessDelivery(
        event.deduplicationId,
        dbConfig.id,
      );
    if (!shouldProcess) {
      return {
        status: "duplicate",
        reason: "Delivery already processed",
        existingId,
      };
    }

    // 6. Record delivery start
    const delivery = await this.deduplication.recordDeliveryStart({
      provider: provider.name as any,
      webhookConfigId: dbConfig.id,
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
          result.projectId,
        );
      } else {
        // No ticket created, just mark as succeeded
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, "succeeded");
      }

      return {
        status: "processed",
        ticketId: result.ticketId,
        jobId: result.jobId,
      };
    } catch (error) {
      // Record failure
      await this.deduplication.recordDeliveryFailureById(
        delivery.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get failed webhook deliveries for manual retry
   */
  async getFailedDeliveries(
    limit = 50,
  ): Promise<Awaited<ReturnType<WebhookDeliveryDAO["getPendingDeliveries"]>>> {
    return await this.deduplication.getFailedDeliveries(limit);
  }

  /**
   * Retry a failed webhook delivery
   */
  async retryDelivery(deliveryId: string): Promise<WebhookProcessingResult> {
    const delivery = await this.deliveryDAO.getDeliveryByDeliveryId(deliveryId);
    if (!delivery) {
      return {
        status: "failed",
        reason: "Delivery not found",
      };
    }

    // Don't retry already successful deliveries
    if (delivery.status === "succeeded") {
      return {
        status: "duplicate",
        reason: "Delivery already succeeded",
        existingId: delivery.id,
      };
    }

    // Get provider
    const provider = this.registry.get(delivery.provider);
    if (!provider) {
      return {
        status: "failed",
        reason: `Provider '${delivery.provider}' not registered`,
      };
    }

    // Get config
    const dbConfig = delivery.webhookConfigId
      ? await this.configDAO.getConfigById(delivery.webhookConfigId)
      : await this.resolveConfigFromProvider(delivery.provider);
    if (!dbConfig) {
      return {
        status: "failed",
        reason: "Webhook configuration not found",
      };
    }

    // Re-process the event
    try {
      // Parse and process the event
      const event = provider.parseEvent(delivery.payload, {
        ...(delivery.provider === "github"
          ? {
              "x-github-event": this.getRetryEventTypeForProvider(
                delivery.provider,
                delivery.eventType,
              ),
              "x-github-delivery": delivery.deliveryId,
            }
          : {}),
        ...(delivery.provider === "jira"
          ? {
              "x-atlassian-webhook-identifier": delivery.deliveryId,
            }
          : {}),
        ...(delivery.provider === "shortcut"
          ? {
              "x-shortcut-delivery": delivery.deliveryId,
            }
          : {}),
        ...(delivery.provider === "custom"
          ? {
              "x-webhook-delivery-id": delivery.deliveryId,
            }
          : {}),
      });

      const result = await this.processProviderEvent(
        event,
        dbConfig,
        undefined,
      );

      // Record success
      if (result.ticketId && result.projectId) {
        await this.deduplication.recordDeliverySuccessById(
          delivery.id,
          result.ticketId,
          result.projectId,
        );
      } else {
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, "succeeded");
      }

      return {
        status: "processed",
        ticketId: result.ticketId,
        jobId: result.jobId,
      };
    } catch (error) {
      await this.deduplication.recordDeliveryFailureById(
        delivery.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Resolve webhook configuration for an event
   */
  private async resolveConfig(
    event: ParsedWebhookEvent,
    options: {
      providerName: "github" | "jira" | "shortcut" | "custom";
      configId?: string;
      integrationId?: string;
      providerProjectId?: string;
    },
  ): Promise<WebhookConfig | null> {
    const providerProjectIds = this.buildProviderProjectIdCandidates(
      options.providerProjectId,
      event,
    );

    if (options.configId) {
      const directConfig = await this.configDAO.getConfigById(options.configId);
      if (!directConfig) {
        return null;
      }

      if (directConfig.direction !== "inbound") {
        return null;
      }

      if (directConfig.provider !== options.providerName) {
        return null;
      }

      if (
        options.integrationId &&
        directConfig.integrationId !== options.integrationId
      ) {
        return null;
      }

      return directConfig;
    }

    if (options.integrationId) {
      const integrationConfigs = await this.configDAO.listByIntegrationId(
        options.integrationId,
        {
          direction: "inbound",
          activeOnly: false,
        },
      );
      const providerConfigs = integrationConfigs.filter(
        (config) => config.provider === options.providerName,
      );
      return this.selectDeterministicConfig(providerConfigs, providerProjectIds);
    }

    for (const providerProjectId of providerProjectIds) {
      const config = await this.configDAO.getActiveConfigByProviderProject(
        options.providerName,
        providerProjectId,
        "inbound",
      );
      if (config) return config;
    }

    if (event.metadata.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        event.metadata.projectId,
        50,
        0,
        "inbound",
      );
      const providerConfigs = projectConfigs.filter(
        (config) => config.provider === options.providerName,
      );
      return this.selectDeterministicConfig(providerConfigs, providerProjectIds);
    }

    return null;
  }

  private buildProviderProjectIdCandidates(
    explicitProviderProjectId: string | undefined,
    event: ParsedWebhookEvent,
  ): string[] {
    const candidates: string[] = [];
    for (const candidate of [
      explicitProviderProjectId,
      event.metadata.repositoryId,
      event.metadata.projectId,
    ]) {
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  private selectDeterministicConfig(
    configs: WebhookConfig[],
    providerProjectIds: string[],
  ): WebhookConfig | null {
    if (configs.length === 0) {
      return null;
    }

    for (const providerProjectId of providerProjectIds) {
      const matches = configs.filter(
        (config) => config.providerProjectId === providerProjectId,
      );
      if (matches.length > 0) {
        return this.pickPreferredConfig(matches);
      }
    }

    return this.pickPreferredConfig(configs);
  }

  private pickPreferredConfig(configs: WebhookConfig[]): WebhookConfig | null {
    if (configs.length === 0) {
      return null;
    }

    const sorted = [...configs].sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }

      const updatedAtDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (updatedAtDelta !== 0) {
        return updatedAtDelta;
      }

      const createdAtDelta = b.createdAt.getTime() - a.createdAt.getTime();
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }

      return b.id.localeCompare(a.id);
    });

    return sorted[0];
  }

  /**
   * Resolve webhook configuration by provider type
   */
  private async resolveConfigFromProvider(
    provider: WebhookConfig["provider"],
  ): Promise<WebhookConfig | null> {
    const configs = await this.configDAO.listConfigsByProvider(
      provider,
      50,
      0,
      "inbound",
    );
    return configs.find((config) => config.active) || null;
  }

  /**
   * Convert DB config to provider config
   */
  private toProviderConfig(
    dbConfig: WebhookConfig,
  ): WebhookProviderConfig {
    return {
      type: dbConfig.provider,
      secretLocation: dbConfig.secretLocation,
      secretPath: dbConfig.secretPath || undefined,
      algorithm: "sha256",
      allowedEvents: dbConfig.allowedEvents,
      webhookSecret: dbConfig.webhookSecretEncrypted || undefined,
      apiToken: dbConfig.apiTokenEncrypted || undefined,
      providerProjectId: dbConfig.providerProjectId || undefined,
    };
  }

  /**
   * Check if event type is allowed by configuration
   */
  private isEventAllowed(event: ParsedWebhookEvent, config: WebhookConfig): boolean {
    if (!config.allowedEvents || config.allowedEvents.length === 0) {
      return true; // No restriction
    }

    const allowedEvents = new Set(config.allowedEvents);
    if (allowedEvents.has("*")) {
      return true;
    }

    const candidates = this.getAllowedEventCandidates(event);
    return candidates.some((candidate) => allowedEvents.has(candidate));
  }

  private getAllowedEventCandidates(event: ParsedWebhookEvent): string[] {
    const candidates = new Set<string>([event.eventType]);
    const dotIndex = event.eventType.indexOf(".");

    if (dotIndex > 0) {
      candidates.add(event.eventType.slice(0, dotIndex));
    } else if (event.metadata.action) {
      candidates.add(`${event.eventType}.${event.metadata.action}`);
    }

    return Array.from(candidates);
  }

  private getRetryEventTypeForProvider(
    provider: WebhookConfig["provider"],
    storedEventType: string,
  ): string {
    if (provider === "github") {
      return storedEventType.split(".")[0];
    }

    return storedEventType;
  }

  /**
   * Get signature header for provider
   */
  private getSignatureHeader(
    providerName: string,
    headers: Record<string, string>,
  ): string | undefined {
    switch (providerName) {
      case "github":
        return headers["x-hub-signature-256"] || headers["x-hub-signature"];
      case "jira":
        return (
          headers["x-atlassian-webhook-signature"] ||
          headers["x-hub-signature"]
        );
      case "shortcut":
        return headers["x-shortcut-signature"];
      case "custom":
        return headers["x-webhook-signature-256"];
      default:
        return undefined;
    }
  }

  private async verifySignature(params: {
    provider: WebhookProvider;
    providerConfig: WebhookProviderConfig;
    providerName: string;
    headers: Record<string, string>;
    rawBody: Buffer;
    tenantId?: string;
  }): Promise<{ valid: boolean; reason?: string }> {
    const {
      provider,
      providerConfig,
      providerName,
      headers,
      rawBody,
      tenantId,
    } = params;

    const signatureHeader = this.getSignatureHeader(providerName, headers);

    let secret: string | undefined;
    try {
      secret = await this.secretService.getSecret(providerConfig, tenantId);
    } catch {
      // GitHub always requires signature verification.
      if (providerName === "github") {
        return {
          valid: false,
          reason: "Webhook secret is not configured",
        };
      }

      // For optional-signature providers, allow unsigned requests when no secret exists.
      if (!signatureHeader) {
        return { valid: true };
      }

      return {
        valid: false,
        reason: "Webhook secret is not configured",
      };
    }

    if (!secret) {
      if (providerName === "github" || signatureHeader) {
        return {
          valid: false,
          reason: "Webhook secret is not configured",
        };
      }
      return { valid: true };
    }

    if (!signatureHeader) {
      return {
        valid: false,
        reason: "Missing signature header",
      };
    }

    if (!provider.verifySignature(rawBody, signatureHeader, secret)) {
      return {
        valid: false,
        reason: "Invalid signature",
      };
    }

    return { valid: true };
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(headers)) {
      if (typeof rawValue === "string") {
        normalized[rawKey.toLowerCase()] = rawValue;
      } else if (Array.isArray(rawValue) && rawValue.length > 0) {
        normalized[rawKey.toLowerCase()] = rawValue[0];
      }
    }
    return normalized;
  }

  /**
   * Record a failed delivery attempt
   */
  private async recordFailedDelivery(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    reason: string,
  ): Promise<void> {
    try {
      const { shouldProcess } = await this.deduplication.shouldProcessDelivery(
        event.deduplicationId,
        config.id,
      );
      if (!shouldProcess) {
        return;
      }

      const delivery = await this.deduplication.recordDeliveryStart({
        provider: config.provider as any,
        webhookConfigId: config.id,
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
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    switch (event.provider) {
      case "github":
        return await this.processGitHubEvent(event, config, tenantId);

      case "jira":
        return await this.processJiraEvent(event, config, tenantId);

      case "shortcut":
        return await this.processShortcutEvent(event, config, tenantId);

      case "custom":
        return await this.processCustomEvent(event, config, tenantId);

      default:
        return result;
    }
  }

  /**
   * Create minimal ticket metadata for webhook-originated tickets
   */
  private createTicketMetadata(
    baseData: Record<string, unknown>,
  ): TicketMetadata {
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
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    // Project linkage should prefer explicit webhook config linkage first.
    const resolvedProjectId =
      config.projectId || tenantId || this.config.defaultTenantId || "default";
    result.projectId = resolvedProjectId;

    const baseEventType = event.eventType.split(".")[0];

    // Handle issues.opened events
    if (baseEventType === "issues") {
      const payload = event.payload as {
        action?: string;
        issue?: {
          number: number;
          title: string;
          body?: string;
          html_url: string;
          user: { login: string };
          state: string;
          labels?: Array<{ name: string }>;
        };
        repository?: {
          full_name: string;
          owner: { login: string };
          name: string;
        };
        installation?: {
          id: number;
        };
        sender?: {
          login: string;
        };
      };

      const action = payload?.action || event.metadata.action;
      if (action === "opened" && payload?.issue) {
        // Determine severity based on issue labels/content
        let severity: Severity = "low";
        const labels = payload.issue.labels;
        if (labels) {
          const labelNames = labels.map((l) => l.name.toLowerCase());
          if (
            labelNames.some(
              (l) => l.includes("critical") || l.includes("urgent"),
            )
          ) {
            severity = "critical";
          } else if (
            labelNames.some(
              (l) => l.includes("high") || l.includes("important"),
            )
          ) {
            severity = "high";
          } else if (labelNames.some((l) => l.includes("medium"))) {
            severity = "medium";
          }
        }

        // Create ticket
        const ticketRequest: CreateTicketRequest = {
          projectId: resolvedProjectId,
          title: payload.issue.title,
          description: payload.issue.body || "",
          severity,
          category: "bug",
          metadata: this.createTicketMetadata({
            externalTicketId: String(payload.issue.number),
            externalTicketUrl: payload.issue.html_url,
            webhookConfigId: config.id,
            provider: "github",
            repository: payload.repository?.full_name,
            sender: payload.sender?.login,
            issueState: payload.issue.state,
            eventType: event.eventType,
            eventAction: action,
            deliveryId: event.deduplicationId,
            integrationId: config.integrationId,
            providerProjectId: config.providerProjectId,
            installationId: payload.installation?.id?.toString(),
          }),
          annotations: [],
          autoFixRequested: config.autoExecute,
          ticketSystem: "github",
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
            tenantId: resolvedProjectId,
            repository: payload.repository?.full_name || "",
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

    // Handle issue_comment.created events
    if (baseEventType === "issue_comment") {
      const payload = event.payload as {
        action?: string;
        issue?: {
          number: number;
          title: string;
          body?: string;
          html_url?: string;
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

      const action = payload?.action || event.metadata.action;
      if (action !== "created") {
        return result;
      }

      // Check if comment mentions bot and contains trigger keywords.
      if (config.botUsername && payload?.comment) {
        const normalizedBotUsername = config.botUsername.toLowerCase();
        const commentAuthor =
          payload.comment.user?.login?.toLowerCase() ||
          payload.sender?.login?.toLowerCase() ||
          "";
        if (commentAuthor === normalizedBotUsername) {
          return result;
        }

        const commentBody = payload.comment.body?.toLowerCase() || "";
        const mentionsBot =
          commentBody.includes(`@${normalizedBotUsername}`) ||
          commentBody.includes(normalizedBotUsername);

        const hasTriggerKeyword =
          commentBody.includes("fix this") ||
          commentBody.includes("fix it") ||
          commentBody.includes("auto fix") ||
          commentBody.includes("autofix");

        if (mentionsBot && hasTriggerKeyword) {
          // Create ticket
          const ticketRequest: CreateTicketRequest = {
            projectId: resolvedProjectId,
            title: payload.issue?.title || `Issue ${payload.issue?.number}`,
            description: payload.comment?.body || "",
            severity: "medium",
            category: "bug",
            metadata: this.createTicketMetadata({
              externalTicketId: String(payload.issue?.number),
              externalTicketUrl: payload.issue?.html_url,
              webhookConfigId: config.id,
              provider: "github",
              repository: payload.repository?.full_name,
              commentId: payload.comment.id.toString(),
              triggeredByComment: true,
              sender: payload.sender?.login,
              eventType: event.eventType,
              eventAction: action,
              deliveryId: event.deduplicationId,
              integrationId: config.integrationId,
              providerProjectId: config.providerProjectId,
            }),
            annotations: [],
            autoFixRequested: true,
            ticketSystem: "github",
          };

          const ticket = await this.ticketDAO.createTicket(ticketRequest);
          result.ticketId = ticket.id;

          // Always create job for bot-triggered requests
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueNumber: payload.issue?.number,
            triggeredBy: "bot-command",
            commentBody: payload.comment?.body?.substring(0, 500),
            stepsToReproduce: `Triggered by bot comment: ${payload.comment?.body?.substring(0, 200)}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedProjectId,
            repository: payload.repository?.full_name || "",
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

  /**
   * Process Jira webhook event
   */
  private async processJiraEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    // Resolve tenant ID
    const resolvedTenantId =
      tenantId || this.config.defaultTenantId || config.projectId || "default";
    result.projectId = resolvedTenantId;

    // Handle issue_created events
    if (event.eventType === "issue_created") {
      const payload = event.payload as {
        issue?: {
          key: string;
          fields: {
            summary: string;
            description?: string | { type: string; content: unknown[] };
            priority?: { name: string };
            issuetype: { name: string };
          };
        };
        user?: {
          displayName: string;
        };
      };

      if (payload?.issue) {
        // Determine severity based on priority
        let severity: Severity = "medium";
        const priorityName = payload.issue.fields.priority?.name?.toLowerCase() || "";
        if (priorityName.includes("highest") || priorityName.includes("critical")) {
          severity = "critical";
        } else if (priorityName.includes("high")) {
          severity = "high";
        } else if (priorityName.includes("low")) {
          severity = "low";
        }

        // Extract description text (handle both string and ADF format)
        let description = "";
        const descField = payload.issue.fields.description;
        if (typeof descField === "string") {
          description = descField;
        } else if (descField && typeof descField === "object") {
          // Simple ADF text extraction (for production, use proper ADF parsing)
          description = JSON.stringify(descField);
        }

        // Create ticket
        const ticketRequest: CreateTicketRequest = {
          projectId: resolvedTenantId,
          title: payload.issue.fields.summary,
          description,
          severity,
          category: "bug",
          metadata: this.createTicketMetadata({
            externalTicketId: payload.issue.key,
            webhookConfigId: config.id,
            provider: "jira",
            sender: payload.user?.displayName,
            issueType: payload.issue.fields.issuetype.name,
          }),
          annotations: [],
          autoFixRequested: config.autoExecute,
          ticketSystem: "jira",
        };

        const ticket = await this.ticketDAO.createTicket(ticketRequest);
        result.ticketId = ticket.id;

        // Create job if auto_execute is enabled
        if (config.autoExecute) {
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueKey: payload.issue.key,
            stepsToReproduce: `Jira Issue: ${payload.issue.key}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: payload.issue.key.split("-")[0] || "",
            task: `Fix Jira issue: ${payload.issue.fields.summary}`,
            context: webhookContext as any,
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

    // Handle comment_created events for bot mentions
    if (event.eventType === "comment_created") {
      const payload = event.payload as {
        issue?: {
          key: string;
          fields: {
            summary: string;
          };
        };
        comment?: {
          body: string;
          author: {
            displayName: string;
          };
        };
      };

      if (config.botUsername && payload?.comment) {
        const commentBody = payload.comment.body.toLowerCase();
        const mentionsBot =
          commentBody.includes(`@${config.botUsername.toLowerCase()}`) ||
          commentBody.includes(config.botUsername.toLowerCase());

        const hasTriggerKeyword =
          commentBody.includes("fix this") ||
          commentBody.includes("fix it") ||
          commentBody.includes("auto fix") ||
          commentBody.includes("autofix");

        if (mentionsBot && hasTriggerKeyword) {
          const ticketRequest: CreateTicketRequest = {
            projectId: resolvedTenantId,
            title: payload.issue?.fields.summary || `Jira Issue ${payload.issue?.key}`,
            description: payload.comment.body,
            severity: "medium",
            category: "bug",
            metadata: this.createTicketMetadata({
              externalTicketId: payload.issue?.key,
              webhookConfigId: config.id,
              provider: "jira",
              triggeredByComment: true,
              sender: payload.comment.author.displayName,
            }),
            annotations: [],
            autoFixRequested: true,
            ticketSystem: "jira",
          };

          const ticket = await this.ticketDAO.createTicket(ticketRequest);
          result.ticketId = ticket.id;

          // Always create job for bot-triggered requests
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueKey: payload.issue?.key,
            triggeredBy: "bot-command",
            commentBody: payload.comment.body.substring(0, 500),
            stepsToReproduce: `Triggered by Jira comment on ${payload.issue?.key}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: payload.issue?.key?.split("-")[0] || "",
            task: `Fix Jira issue: ${payload.issue?.fields.summary}`,
            context: webhookContext as any,
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

  /**
   * Process Shortcut webhook event
   */
  private async processShortcutEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    // Resolve tenant ID
    const resolvedTenantId =
      tenantId || this.config.defaultTenantId || config.projectId || "default";
    result.projectId = resolvedTenantId;

    // Handle story_created events
    if (event.eventType === "story_created") {
      const payload = event.payload as {
        data?: {
          id: number;
          name: string;
          description?: string;
          story_type: "feature" | "bug" | "chore";
          workflow_state?: { name: string };
          project?: { name: string };
          app_url: string;
        };
      };

      if (payload?.data) {
        // Map story type to severity
        let severity: Severity = "medium";
        switch (payload.data.story_type) {
          case "bug":
            severity = "high";
            break;
          case "feature":
            severity = "medium";
            break;
          case "chore":
            severity = "low";
            break;
        }

        // Create ticket
        const ticketRequest: CreateTicketRequest = {
          projectId: resolvedTenantId,
          title: payload.data.name,
          description: payload.data.description || "",
          severity,
          category: payload.data.story_type === "bug" ? "bug" : "feature",
          metadata: this.createTicketMetadata({
            externalTicketId: payload.data.id.toString(),
            externalTicketUrl: payload.data.app_url,
            webhookConfigId: config.id,
            provider: "shortcut",
            storyType: payload.data.story_type,
            project: payload.data.project?.name,
            workflowState: payload.data.workflow_state?.name,
          }),
          annotations: [],
          autoFixRequested: config.autoExecute && payload.data.story_type === "bug",
          ticketSystem: "shortcut",
        };

        const ticket = await this.ticketDAO.createTicket(ticketRequest);
        result.ticketId = ticket.id;

        // Create job if auto_execute is enabled and it's a bug
        if (config.autoExecute && payload.data.story_type === "bug") {
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueNumber: payload.data.id,
            issueUrl: payload.data.app_url,
            stepsToReproduce: `Shortcut Story: ${payload.data.app_url}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: payload.data.project?.name || "",
            task: `Fix Shortcut story: ${payload.data.name}`,
            context: webhookContext as any,
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

    // Handle comment_created events for bot mentions
    if (event.eventType === "comment_created") {
      const payload = event.payload as {
        data?: {
          story_id: number;
          text: string;
          author_id: string;
        };
      };

      if (config.botUsername && payload?.data) {
        const commentBody = payload.data.text.toLowerCase();
        const mentionsBot =
          commentBody.includes(`@${config.botUsername.toLowerCase()}`) ||
          commentBody.includes(config.botUsername.toLowerCase());

        const hasTriggerKeyword =
          commentBody.includes("fix this") ||
          commentBody.includes("fix it") ||
          commentBody.includes("auto fix") ||
          commentBody.includes("autofix");

        if (mentionsBot && hasTriggerKeyword) {
          const ticketRequest: CreateTicketRequest = {
            projectId: resolvedTenantId,
            title: `Shortcut Comment on Story ${payload.data.story_id}`,
            description: payload.data.text,
            severity: "medium",
            category: "bug",
            metadata: this.createTicketMetadata({
              externalTicketId: payload.data.story_id.toString(),
              webhookConfigId: config.id,
              provider: "shortcut",
              triggeredByComment: true,
            }),
            annotations: [],
            autoFixRequested: true,
            ticketSystem: "shortcut",
          };

          const ticket = await this.ticketDAO.createTicket(ticketRequest);
          result.ticketId = ticket.id;

          // Always create job for bot-triggered requests
          const webhookContext: WebhookJobContext = {
            ticketId: ticket.id,
            issueNumber: payload.data.story_id,
            triggeredBy: "bot-command",
            commentBody: payload.data.text.substring(0, 500),
            stepsToReproduce: `Triggered by Shortcut comment on story ${payload.data.story_id}`,
          };

          const jobData: JobData = {
            id: randomUUID(),
            tenantId: resolvedTenantId,
            repository: "",
            task: `Fix Shortcut story from comment: ${payload.data.story_id}`,
            context: webhookContext as any,
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

  /**
   * Process custom webhook event
   */
  private async processCustomEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const result: EventProcessingResult = {};

    if (!tenantId && !config.projectId) {
      throw new Error("No project linked to this webhook configuration");
    }

    const resolvedTenantId =
      tenantId || config.projectId || this.config.defaultTenantId || "default";
    result.projectId = resolvedTenantId;

    if (event.eventType !== "ticket_created") {
      return result;
    }

    const payload = event.payload as {
      title: string;
      description: string;
      severity?: string;
      category?: string;
      externalId?: string;
      url?: string;
    };

    const severityCandidates: Severity[] = ["low", "medium", "high", "critical"];
    const severity = severityCandidates.includes(payload.severity as Severity)
      ? (payload.severity as Severity)
      : "medium";

    const ticket = await this.ticketDAO.createTicket({
      projectId: resolvedTenantId,
      title: payload.title,
      description: payload.description,
      severity,
      category: payload.category || "bug",
      metadata: this.createTicketMetadata({
        externalTicketId: payload.externalId,
        externalTicketUrl: payload.url,
        webhookConfigId: config.id,
        provider: "custom",
      }),
      annotations: [] as Annotation[],
      ticketSystem: "custom",
      autoFixRequested: config.autoExecute,
    });
    result.ticketId = ticket.id;

    if (payload.externalId || payload.url) {
      await this.ticketDAO.updateTicket(ticket.id, {
        externalTicketId: payload.externalId || undefined,
        externalTicketUrl: payload.url || undefined,
      });
    }

    return result;
  }
}
