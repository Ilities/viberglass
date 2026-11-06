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
    private secretService: Pick<WebhookSecretService, "getSecret" | "encryptSecret">,
    private handler: Pick<InboundEventHandler, "handle">,
    private configResolver: Pick<WebhookConfigResolver, "resolveInboundConfig" | "updateConfig">,
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

    const handshakeSecret = receiver.handshakeOf?.(normalizedHeaders);
    if (handshakeSecret !== undefined) {
      return this.completeHandshake(dbConfig, handshakeSecret);
    }

    let events: InboundWebhookEvent[];
    try {
      events = receiver.parseEvents
        ? receiver.parseEvents(payload, normalizedHeaders)
        : [receiver.parseEvent(payload, normalizedHeaders)];
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      return error instanceof InvalidWebhookPayloadError
        ? { status: "invalid", reason }
        : { status: "ignored", reason: `Event parsing failed: ${reason}` };
    }

    if (!dbConfig.active) {
      const reason = `Webhook configuration '${dbConfig.id}' is inactive`;
      for (const event of events) {
        await this.deliveryLifecycle.recordIgnored(event, dbConfig, reason);
      }
      return { status: "ignored", reason };
    }

    if (events.length === 0) {
      return { status: "ignored", reason: "No events in this delivery" };
    }

    let signature: { valid: boolean; reason?: string } | undefined;
    let result: WebhookProcessingResult | undefined;
    for (const event of events) {
      if (!isEventAllowed(event, dbConfig)) {
        const allowedCandidates = getAllowedEventCandidates(event).join(", ");
        const reason = `The webhook isn't set to receive '${allowedCandidates}'`;
        await this.deliveryLifecycle.recordIgnored(event, dbConfig, reason);
        result = { status: "ignored", reason };
        continue;
      }

      signature ??= await verifySignature({
        secretService: this.secretService,
        receiver,
        config: dbConfig,
        signature: receiver.signatureOf(normalizedHeaders),
        rawBody,
        tenantId,
      });
      if (!signature.valid) {
        const reason = `Rejected: ${signature.reason ?? "Invalid signature"}`;
        await this.deliveryLifecycle.recordRejected(event, dbConfig, reason);
        result = { status: "rejected", reason: signature.reason ?? "Invalid signature" };
        continue;
      }

      const { shouldProcess, existingId } = await this.deduplication.shouldProcessDelivery(
        event.deduplicationId,
        dbConfig.id,
      );
      if (!shouldProcess) {
        result = { status: "duplicate", reason: "Delivery already processed", existingId };
        continue;
      }

      const delivery = await this.deliveryLifecycle.recordStart({
        provider: dbConfig.provider,
        webhookConfigId: dbConfig.id,
        deliveryId: event.deduplicationId,
        eventType: event.eventType,
        payload,
      });

      try {
        const handled = await this.handler.handle({
          event,
          config: dbConfig,
          receiver,
          tenantId,
          defaultTenantId: this.config.defaultTenantId,
        });
        await this.deliveryLifecycle.recordSuccess(delivery.id, handled);

        if (handled.ignoredReason) {
          result = { status: "ignored", reason: handled.ignoredReason };
          continue;
        }

        result = { status: "processed", ticketId: handled.ticketId, jobId: handled.jobId };
      } catch (error) {
        await this.deliveryLifecycle.recordFailure(
          delivery.id,
          error instanceof Error ? error : new Error(String(error)),
        );
        result = { status: "failed", reason: error instanceof Error ? error.message : "Unknown error" };
      }
    }

    return result ?? { status: "ignored", reason: "No events in this delivery" };
  }

  /** Stores a setup handshake's secret as the webhook's signing secret, to be echoed back. */
  private async completeHandshake(
    config: WebhookConfig,
    secret: string,
  ): Promise<WebhookProcessingResult> {
    const encrypted = await this.secretService.encryptSecret(secret);
    await this.configResolver.updateConfig(config.id, {
      secretLocation: "database",
      webhookSecretEncrypted: encrypted,
    });
    return { status: "handshake", secret };
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
