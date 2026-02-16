import type { ParsedWebhookEvent, ProviderType } from "./WebhookProvider";
import type { ProviderRegistry } from "./ProviderRegistry";
import type { InboundEventProcessorResolver } from "./InboundEventProcessorResolver";
import type {
  WebhookDeliveryAttempt,
  WebhookDeliveryDAO,
} from "../persistence/webhook/WebhookDeliveryDAO";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type {
  RetryDeliveryOptions,
  WebhookProcessingResult,
  WebhookServiceConfig,
} from "./webhookServiceTypes";
import type { WebhookConfigResolver } from "./WebhookConfigResolver";
import type { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import type { ProviderWebhookPolicyResolver } from "./ProviderWebhookPolicyResolver";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "WebhookRetryService" });

export class WebhookRetryService {
  constructor(
    private registry: ProviderRegistry,
    private configResolver: WebhookConfigResolver,
    private deliveryLifecycle: InboundWebhookDeliveryLifecycle,
    private providerPolicyResolver: ProviderWebhookPolicyResolver,
    private processorResolver: InboundEventProcessorResolver,
    private deliveryDAO: WebhookDeliveryDAO,
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

    const provider = this.registry.get(delivery.provider);
    if (!provider) {
      return {
        status: "failed",
        reason: `Provider '${delivery.provider}' not registered`,
      };
    }

    const dbConfig = delivery.webhookConfigId
      ? await this.configResolver.getConfigById(delivery.webhookConfigId)
      : await this.configResolver.resolveActiveInboundConfigForProvider(
          delivery.provider,
        );
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
      const retryHeaders = this.providerPolicyResolver
        .resolve(delivery.provider)
        .buildRetryHeaders({
          deliveryId: delivery.deliveryId,
          eventType: delivery.eventType,
        });

      const event = provider.parseEvent(delivery.payload, retryHeaders);
      const result = await processProviderEvent(
        this.processorResolver,
        this.config,
        event,
        dbConfig,
      );

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
  deliveryDAO: WebhookDeliveryDAO,
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

async function processProviderEvent(
  processorResolver: InboundEventProcessorResolver,
  config: WebhookServiceConfig,
  event: ParsedWebhookEvent,
  webhookConfig: WebhookConfig,
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
    tenantId: undefined,
    defaultTenantId: config.defaultTenantId,
  });
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
