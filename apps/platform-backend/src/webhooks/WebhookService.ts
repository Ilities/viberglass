import { InvalidWebhookPayloadError, type InboundWebhookEvent, type WebhookReceiver } from "@viberglass/integration-core";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./DeduplicationService";
import type { WebhookSecretService } from "./WebhookSecretService";
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
    private receivers: WebhookReceivers,
    private deduplication: Pick<DeduplicationService, "shouldProcessDelivery" | "getFailedDeliveries">,
    private secretService: Pick<WebhookSecretService, "getSecret">,
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

    let event: InboundWebhookEvent;
    try {
      event = receiver.parseEvent(payload, normalizedHeaders);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      return error instanceof InvalidWebhookPayloadError
        ? { status: "invalid", reason }
        : { status: "ignored", reason: `Event parsing failed: ${reason}` };
    }

    if (!dbConfig.active) {
      const reason = `Webhook configuration '${dbConfig.id}' is inactive`;
      await this.deliveryLifecycle.recordIgnored(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    if (!isEventAllowed(event, dbConfig)) {
      const allowedCandidates = getAllowedEventCandidates(event).join(", ");
      const reason = `The webhook isn't set to receive '${allowedCandidates}'`;
      await this.deliveryLifecycle.recordIgnored(event, dbConfig, reason);
      return {
        status: "ignored",
        reason,
      };
    }

    const signatureResult = await verifySignature({
      secretService: this.secretService,
      receiver,
      config: dbConfig,
      signature: receiver.signatureOf(normalizedHeaders),
      rawBody,
      tenantId,
    });
    if (!signatureResult.valid) {
      const reason = `Rejected: ${signatureResult.reason ?? "Invalid signature"}`;
      await this.deliveryLifecycle.recordRejected(event, dbConfig, reason);
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

async function verifySignature(params: {
  secretService: Pick<WebhookSecretService, "getSecret">;
  receiver: WebhookReceiver;
  config: WebhookConfig;
  signature?: string;
  rawBody: Buffer;
  tenantId?: string;
}): Promise<{ valid: boolean; reason?: string }> {
  // Every webhook must have a secret. An unsigned delivery is an unauthenticated
  // request that can create tickets, and ticket bodies reach the agent prompt verbatim.
  let secret: string | undefined;
  try {
    secret = await params.secretService.getSecret(
      {
        secretLocation: params.config.secretLocation,
        secretPath: params.config.secretPath || undefined,
        webhookSecret: params.config.webhookSecretEncrypted || undefined,
      },
      params.tenantId,
    );
  } catch {
    return { valid: false, reason: "Webhook secret is not configured" };
  }

  if (!secret) {
    return { valid: false, reason: "Webhook secret is not configured" };
  }
  if (!params.signature) {
    return { valid: false, reason: "Missing signature header" };
  }
  if (!params.receiver.verifySignature(params.rawBody, params.signature, secret)) {
    return { valid: false, reason: "Invalid signature" };
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
