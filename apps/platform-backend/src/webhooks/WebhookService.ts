import { InvalidWebhookPayloadError, type InboundWebhookEvent } from "@viberglass/integration-core";
import type { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./DeduplicationService";
import type { WebhookSignatureVerifier } from "./WebhookSignatureVerifier";
import type { InboundEventHandler } from "./InboundEventHandler";
import type { WebhookConfigResolver } from "./WebhookConfigResolver";
import type { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import type { WebhookReceivers } from "./webhookReceivers";
import type {
  RetryDeliveryOptions,
  WebhookProcessingOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";
import { eventRefusal } from "./WebhookEventFilter";
import type { WebhookRetryService } from "./WebhookRetryService";

export type {
  RetryDeliveryOptions,
  WebhookProcessingOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";

export class WebhookService {
  constructor(
    private receivers: WebhookReceivers,
    private deduplication: Pick<DeduplicationService, "shouldProcessDelivery" | "getFailedDeliveries">,
    private signatures: Pick<WebhookSignatureVerifier, "verify">,
    private handler: Pick<InboundEventHandler, "handle">,
    private configResolver: Pick<WebhookConfigResolver, "resolveInboundConfig">,
    private deliveryLifecycle: InboundWebhookDeliveryLifecycle,
    private retryService: Pick<WebhookRetryService, "retryDelivery">,
    private config: WebhookServiceConfig = {},
  ) {}

  async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
    rawBody: Buffer,
    tenantId: string | undefined,
    options: WebhookProcessingOptions,
  ): Promise<WebhookProcessingResult> {
    const normalizedHeaders = normalizeHeaders(headers);

    const receiver = this.receivers.get(options.providerName);
    const dbConfig = receiver ? await this.configResolver.resolveInboundConfig(options) : null;
    if (!receiver || !dbConfig) {
      return { status: "not_found", reason: "No webhook with this address" };
    }

    const signature = await this.signatures.verify({
      receiver,
      config: dbConfig,
      headers: normalizedHeaders,
      rawBody,
      tenantId,
    });
    if (!signature.valid) {
      await this.deliveryLifecycle.recordRejected(dbConfig, signature.reason);
      return { status: "rejected", reason: signature.reason };
    }

    let event: InboundWebhookEvent;
    try {
      event = receiver.parseEvent(payload, normalizedHeaders);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      return error instanceof InvalidWebhookPayloadError
        ? { status: "invalid", reason }
        : { status: "ignored", reason: `Event parsing failed: ${reason}` };
    }

    const refusal = eventRefusal(event, dbConfig);
    if (refusal) {
      await this.deliveryLifecycle.recordIgnored(event, dbConfig, refusal);
      return { status: "ignored", reason: refusal };
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
      const result = await this.handler.handle({
        event,
        config: dbConfig,
        receiver,
        tenantId,
        defaultTenantId: this.config.defaultTenantId,
      });
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
