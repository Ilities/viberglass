import type { InboundEventHandler } from "./InboundEventHandler";
import type { WebhookReceivers } from "./webhookReceivers";
import type {
  WebhookDeliveryAttempt,
  WebhookDeliveryDAO,
} from "../persistence/webhook/WebhookDeliveryDAO";
import type {
  RetryDeliveryOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";
import type { WebhookConfigResolver } from "./WebhookConfigResolver";
import type { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "WebhookRetryService" });

type RetryDeliveries = Pick<
  WebhookDeliveryDAO,
  "getDeliveryById" | "getDeliveryByIdForConfig" | "getDeliveryByDeliveryId"
>;

export class WebhookRetryService {
  constructor(
    private receivers: WebhookReceivers,
    private configResolver: Pick<WebhookConfigResolver, "getConfigById">,
    private deliveryLifecycle: InboundWebhookDeliveryLifecycle,
    private handler: Pick<InboundEventHandler, "handle">,
    private deliveryDAO: RetryDeliveries,
    private config: WebhookServiceConfig = {},
  ) {}

  async retryDelivery(
    deliveryId: string,
    options: RetryDeliveryOptions = {},
  ): Promise<WebhookProcessingResult> {
    const delivery = await resolveRetryDelivery(this.deliveryDAO, deliveryId, options);
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

    const receiver = this.receivers.get(delivery.provider);
    if (!receiver) {
      return {
        status: "failed",
        reason: `Provider '${delivery.provider}' not registered`,
      };
    }

    const dbConfig = delivery.webhookConfigId
      ? await this.configResolver.getConfigById(delivery.webhookConfigId)
      : null;
    if (!dbConfig) {
      return {
        status: "failed",
        reason: "Webhook configuration not found",
      };
    }

    logger.info("Webhook retry attempt started", {
      deliveryAttemptId: delivery.id,
      deliveryId: delivery.deliveryId,
      webhookConfigId: delivery.webhookConfigId,
      provider: delivery.provider,
      status: delivery.status,
    });

    try {
      const retryHeaders = receiver.retryHeaders({
        deliveryId: delivery.deliveryId,
        eventType: delivery.eventType,
      });
      const event = receiver.parseEvent(delivery.payload, retryHeaders);
      const result = await this.handler.handle({
        event,
        config: dbConfig,
        receiver,
        defaultTenantId: this.config.defaultTenantId,
      });

      await this.deliveryLifecycle.recordSuccess(delivery.id, result);

      if (result.ignoredReason) {
        logger.info("Webhook retry attempt ignored", {
          deliveryAttemptId: delivery.id,
          deliveryId: delivery.deliveryId,
          webhookConfigId: delivery.webhookConfigId,
          provider: delivery.provider,
          reason: result.ignoredReason,
        });

        return {
          status: "ignored",
          reason: result.ignoredReason,
        };
      }

      logger.info("Webhook retry attempt processed", {
        deliveryAttemptId: delivery.id,
        deliveryId: delivery.deliveryId,
        webhookConfigId: delivery.webhookConfigId,
        provider: delivery.provider,
        ticketId: result.ticketId,
        jobId: result.jobId,
      });

      return {
        status: "processed",
        ticketId: result.ticketId,
        jobId: result.jobId,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      await this.deliveryLifecycle.recordFailure(
        delivery.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      logger.warn("Webhook retry attempt failed", {
        deliveryAttemptId: delivery.id,
        deliveryId: delivery.deliveryId,
        webhookConfigId: delivery.webhookConfigId,
        provider: delivery.provider,
        reason,
      });

      return {
        status: "failed",
        reason,
      };
    }
  }
}

async function resolveRetryDelivery(
  deliveryDAO: RetryDeliveries,
  deliveryId: string,
  options: RetryDeliveryOptions,
): Promise<WebhookDeliveryAttempt | null> {
  if (options.deliveryAttemptId && options.webhookConfigId) {
    return deliveryDAO.getDeliveryByIdForConfig(
      options.deliveryAttemptId,
      options.webhookConfigId,
    );
  }

  if (options.deliveryAttemptId) {
    return deliveryDAO.getDeliveryById(options.deliveryAttemptId);
  }

  if (options.webhookConfigId) {
    return deliveryDAO.getDeliveryByDeliveryId(deliveryId, options.webhookConfigId);
  }

  return deliveryDAO.getDeliveryByDeliveryId(deliveryId);
}
