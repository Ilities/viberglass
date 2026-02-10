/**
 * Webhook service orchestration layer
 *
 * Coordinates webhook processing through the provider system:
 * - Provider routing via registry
 * - Signature verification
 * - Deduplication checking
 * - Event processing delegation to InboundEventProcessors
 *
 * This is the main entry point for processing incoming webhooks from
 * external platforms like GitHub and Jira.
 */

import type {
  ParsedWebhookEvent,
  WebhookProvider,
  WebhookProviderConfig,
  ProviderType,
} from "./WebhookProvider";
import type { ProviderRegistry } from "./ProviderRegistry";
import type {
  WebhookConfigDAO,
  WebhookConfig,
} from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./DeduplicationService";
import type { WebhookSecretService } from "./WebhookSecretService";
import type { InboundEventProcessorResolver, EventProcessingResult } from "./InboundEventProcessorResolver";

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
    private processorResolver: InboundEventProcessorResolver,
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
      await this.recordFailedDelivery(event, dbConfig, reason);
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
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, "succeeded");
      }

      if (result.ignoredReason) {
        return {
          status: "ignored",
          reason: result.ignoredReason,
        };
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

    if (delivery.status === "succeeded") {
      return {
        status: "duplicate",
        reason: "Delivery already succeeded",
        existingId: delivery.id,
      };
    }

    const provider = this.registry.get(delivery.provider);
    if (!provider) {
      return {
        status: "failed",
        reason: `Provider '${delivery.provider}' not registered`,
      };
    }

    const dbConfig = delivery.webhookConfigId
      ? await this.configDAO.getConfigById(delivery.webhookConfigId)
      : await this.resolveConfigFromProvider(delivery.provider);
    if (!dbConfig) {
      return {
        status: "failed",
        reason: "Webhook configuration not found",
      };
    }

    try {
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

      const result = await this.processProviderEvent(event, dbConfig, undefined);

      if (result.ticketId && result.projectId) {
        await this.deduplication.recordDeliverySuccessById(
          delivery.id,
          result.ticketId,
          result.projectId,
        );
      } else {
        await this.deliveryDAO.updateDeliveryStatus(delivery.id, "succeeded");
      }

      if (result.ignoredReason) {
        return {
          status: "ignored",
          reason: result.ignoredReason,
        };
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
    const jiraIssueProjectKey = this.extractJiraProjectKeyFromIssue(event);
    for (const candidate of [
      explicitProviderProjectId,
      event.metadata.repositoryId,
      event.metadata.projectId,
      jiraIssueProjectKey,
      ...this.extractShortcutProviderProjectCandidates(event),
    ]) {
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  private extractJiraProjectKeyFromIssue(
    event: ParsedWebhookEvent,
  ): string | undefined {
    if (event.provider !== "jira" || !event.metadata.issueKey) {
      return undefined;
    }

    const separatorIndex = event.metadata.issueKey.indexOf("-");
    if (separatorIndex <= 0) {
      return undefined;
    }

    return event.metadata.issueKey.slice(0, separatorIndex);
  }

  private extractShortcutProviderProjectCandidates(
    event: ParsedWebhookEvent,
  ): string[] {
    if (event.provider !== "shortcut") {
      return [];
    }

    const payload = event.payload as {
      data?: {
        id?: number | string;
        story_id?: number | string;
        project_id?: number | string;
        project?: { id?: number | string; name?: string };
      };
      refs?: Array<{ id?: number | string; entity_type?: string }>;
    };

    const data = payload?.data;
    const refs = Array.isArray(payload?.refs) ? payload.refs : [];
    const referencedStory = refs.find((ref) => ref.entity_type === "story");
    const candidates: Array<string | undefined> = [
      this.normalizeCandidate(event.metadata.issueKey),
      this.normalizeCandidate(data?.project_id),
      this.normalizeCandidate(data?.project?.id),
      this.normalizeCandidate(data?.project?.name),
      this.normalizeCandidate(data?.story_id),
      this.normalizeCandidate(data?.id),
      this.normalizeCandidate(referencedStory?.id),
    ];

    return candidates.filter((candidate): candidate is string => Boolean(candidate));
  }

  private normalizeCandidate(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
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

  private toProviderConfig(dbConfig: WebhookConfig): WebhookProviderConfig {
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

  private isEventAllowed(event: ParsedWebhookEvent, config: WebhookConfig): boolean {
    if (!config.allowedEvents || config.allowedEvents.length === 0) {
      return true;
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
      if (providerName === "github") {
        return {
          valid: false,
          reason: "Webhook secret is not configured",
        };
      }

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
   * Process provider-specific event via the InboundEventProcessorResolver
   */
  private async processProviderEvent(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    tenantId?: string,
  ): Promise<EventProcessingResult> {
    const processor = this.processorResolver.resolve(event.provider as ProviderType);
    return processor.process({
      event,
      config,
      tenantId,
      defaultTenantId: this.config.defaultTenantId,
    });
  }
}
