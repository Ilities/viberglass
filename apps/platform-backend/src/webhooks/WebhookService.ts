import type {
  ParsedWebhookEvent,
  ProviderType,
  WebhookProvider,
  WebhookProviderConfig,
} from "./WebhookProvider";
import type { ProviderRegistry } from "./ProviderRegistry";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./DeduplicationService";
import type { WebhookSecretService } from "./WebhookSecretService";
import type { InboundEventProcessorResolver } from "./InboundEventProcessorResolver";
import type { WebhookConfigResolver } from "./WebhookConfigResolver";
import type { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import type { ProviderWebhookPolicyResolver } from "./ProviderWebhookPolicyResolver";
import type {
  RetryDeliveryOptions,
  WebhookProcessingOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";
import { getAllowedEventCandidates, isEventAllowed } from "./WebhookEventFilter";
import type { WebhookRetryService } from "./WebhookRetryService";

export type {
  RetryDeliveryOptions,
  WebhookProcessingOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";

export class WebhookService {
  constructor(
    private registry: ProviderRegistry,
    private deduplication: DeduplicationService,
    private secretService: WebhookSecretService,
    private processorResolver: InboundEventProcessorResolver,
    private configResolver: WebhookConfigResolver,
    private providerPolicyResolver: ProviderWebhookPolicyResolver,
    private deliveryLifecycle: InboundWebhookDeliveryLifecycle,
    private retryService: WebhookRetryService,
    private config: WebhookServiceConfig = {},
  ) {}

  async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
    rawBody: Buffer,
    tenantId?: string,
    options: WebhookProcessingOptions = {},
  ): Promise<WebhookProcessingResult> {
    const normalizedHeaders = normalizeHeaders(headers);

    const provider = options.providerName
      ? this.registry.get(options.providerName)
      : this.registry.getProviderForHeaders(normalizedHeaders);
    if (!provider) {
      return {
        status: "ignored",
        reason: "No matching provider for request headers",
      };
    }

    let event: ParsedWebhookEvent;
    try {
      event = provider.parseEvent(payload, normalizedHeaders);
    } catch (error) {
      return {
        status: "ignored",
        reason: `Event parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    const providerName = resolveProviderName(provider.name, options.providerName);
    if (!providerName) {
      return {
        status: "ignored",
        reason: `Provider '${provider.name}' is not supported by webhook orchestration`,
      };
    }

    const dbConfig = await this.configResolver.resolveInboundConfig(event, {
      providerName,
      configId: options.configId,
      integrationId: options.integrationId,
      providerProjectId: options.providerProjectId,
    });
    if (!dbConfig) {
      return {
        status: "ignored",
        reason: "No webhook configuration found for this repository/project",
      };
    }

    if (!dbConfig.active) {
      const reason = `Webhook configuration '${dbConfig.id}' is inactive`;
      await this.deliveryLifecycle.recordRejectedOrIgnored(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    if (!isEventAllowed(event, dbConfig)) {
      const allowedCandidates = getAllowedEventCandidates(event).join(", ");
      const reason = `Event '${allowedCandidates}' not allowed for webhook config '${dbConfig.id}'`;
      await this.deliveryLifecycle.recordRejectedOrIgnored(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    const signatureHeader = this.providerPolicyResolver
      .resolve(dbConfig.provider)
      .getSignatureHeader(normalizedHeaders);
    const signatureResult = await verifySignature({
      secretService: this.secretService,
      provider,
      providerConfig: toProviderConfig(dbConfig),
      providerName: dbConfig.provider,
      signatureHeader,
      rawBody,
      tenantId,
    });
    if (!signatureResult.valid) {
      const reason = `Rejected: ${signatureResult.reason ?? "Invalid signature"}`;
      await this.deliveryLifecycle.recordRejectedOrIgnored(event, dbConfig, reason);
      return {
        status: "rejected",
        reason: signatureResult.reason ?? "Invalid signature",
      };
    }

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

    const delivery = await this.deliveryLifecycle.recordStart({
      provider: dbConfig.provider,
      webhookConfigId: dbConfig.id,
      deliveryId: event.deduplicationId,
      eventType: event.eventType,
      payload,
    });

    try {
      const result = await processProviderEvent(
        this.processorResolver,
        this.config,
        event,
        dbConfig,
        tenantId,
      );
      await this.deliveryLifecycle.recordSuccess(delivery.id, result);

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
      await this.deliveryLifecycle.recordFailure(
        delivery.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getFailedDeliveries(
    limit = 50,
  ): Promise<Awaited<ReturnType<WebhookDeliveryDAO["getPendingDeliveries"]>>> {
    return this.deduplication.getFailedDeliveries(limit);
  }

  async retryDelivery(
    deliveryId: string,
    options: RetryDeliveryOptions = {},
  ): Promise<WebhookProcessingResult> {
    return this.retryService.retryDelivery(deliveryId, options);
  }
}

function toProviderConfig(dbConfig: WebhookConfig): WebhookProviderConfig {
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

async function verifySignature(params: {
  secretService: WebhookSecretService;
  provider: WebhookProvider;
  providerConfig: WebhookProviderConfig;
  providerName: WebhookConfig["provider"];
  signatureHeader?: string;
  rawBody: Buffer;
  tenantId?: string;
}): Promise<{ valid: boolean; reason?: string }> {
  let secret: string | undefined;
  try {
    secret = await params.secretService.getSecret(
      params.providerConfig,
      params.tenantId,
    );
  } catch {
    if (params.providerName === "github") {
      return {
        valid: false,
        reason: "Webhook secret is not configured",
      };
    }

    if (!params.signatureHeader) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: "Webhook secret is not configured",
    };
  }

  if (!secret) {
    if (params.providerName === "github" || params.signatureHeader) {
      return {
        valid: false,
        reason: "Webhook secret is not configured",
      };
    }
    return { valid: true };
  }

  if (!params.signatureHeader) {
    return {
      valid: false,
      reason: "Missing signature header",
    };
  }

  if (!params.provider.verifySignature(params.rawBody, params.signatureHeader, secret)) {
    return {
      valid: false,
      reason: "Invalid signature",
    };
  }

  return { valid: true };
}

function normalizeHeaders(
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

async function processProviderEvent(
  processorResolver: InboundEventProcessorResolver,
  config: WebhookServiceConfig,
  event: ParsedWebhookEvent,
  webhookConfig: WebhookConfig,
  tenantId?: string,
): Promise<{
  ticketId?: string;
  jobId?: string;
  projectId?: string;
  ignoredReason?: string;
}> {
  const processor = processorResolver.resolve(toProviderType(event.provider));

  return processor.process({
    event,
    config: webhookConfig,
    tenantId,
    defaultTenantId: config.defaultTenantId,
  });
}

function resolveProviderName(
  providerName: string,
  explicit?: WebhookProcessingOptions["providerName"],
): WebhookConfig["provider"] | undefined {
  if (explicit) {
    return explicit;
  }

  switch (providerName) {
    case "github":
    case "jira":
    case "shortcut":
    case "custom":
      return providerName;
    default:
      return undefined;
  }
}

function toProviderType(provider: string): ProviderType | undefined {
  switch (provider) {
    case "github":
    case "jira":
    case "shortcut":
    case "custom":
      return provider;
    default:
      return undefined;
  }
}
