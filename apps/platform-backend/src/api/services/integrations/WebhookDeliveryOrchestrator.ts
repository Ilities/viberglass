import type { ParsedQs } from "qs";
import logger from "../../../config/logger";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { WebhookDeliveryDAO } from "../../../persistence/webhook/WebhookDeliveryDAO";
import { getWebhookService } from "../../../webhooks/webhookServiceFactory";
import { IntegrationWebhookContextResolver } from "./IntegrationWebhookContextResolver";
import { IntegrationRouteServiceError } from "./errors";
import {
  parseDeliveryStatuses,
  parseNonNegativeInt,
  serializeWebhookDelivery,
} from "./shared";
import type { DeliveryListResult, RetryInboundDeliveryResult } from "./types";
import {
  getInboundConfigForIntegrationOrThrow,
  getOutboundConfigForIntegrationOrThrow,
} from "./integrationWebhookOrchestratorUtils";

interface DeliveryOrchestratorDeps {
  contextResolver: IntegrationWebhookContextResolver;
  webhookConfigDAO: WebhookConfigDAO;
  webhookDeliveryDAO: WebhookDeliveryDAO;
}

export class WebhookDeliveryOrchestrator {
  private readonly deps: DeliveryOrchestratorDeps;

  constructor(
    contextResolver = new IntegrationWebhookContextResolver(),
    webhookConfigDAO = new WebhookConfigDAO(),
    webhookDeliveryDAO = new WebhookDeliveryDAO(),
  ) {
    this.deps = { contextResolver, webhookConfigDAO, webhookDeliveryDAO };
  }

  private toDeliveryListResult(
    deliveries: Awaited<
      ReturnType<WebhookDeliveryDAO["listDeliveriesByConfig"]>
    >,
    limit: number,
    offset: number,
  ): DeliveryListResult {
    return {
      data: deliveries.map((delivery) => serializeWebhookDelivery(delivery)),
      pagination: { limit, offset, count: deliveries.length },
    };
  }

  private async listDeliveries(
    direction: "inbound" | "outbound",
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    const integration =
      await this.deps.contextResolver.getIntegrationOrThrow(integrationId);
    const config =
      direction === "inbound"
        ? await getInboundConfigForIntegrationOrThrow(
            this.deps.webhookConfigDAO,
            integration.id,
            configId,
          )
        : await getOutboundConfigForIntegrationOrThrow(
            this.deps.webhookConfigDAO,
            integration.id,
            configId,
          );
    const statusFilter = parseDeliveryStatuses(query);
    if (statusFilter.invalidValues.length > 0) {
      throw new IntegrationRouteServiceError(
        400,
        `Invalid delivery statuses: ${statusFilter.invalidValues.join(", ")}`,
      );
    }

    const limit = parseNonNegativeInt(query.limit, 50);
    const offset = parseNonNegativeInt(query.offset, 0);
    const deliveries =
      await this.deps.webhookDeliveryDAO.listDeliveriesByConfig(config.id, {
        statuses: statusFilter.statuses,
        limit,
        offset,
        sortOrder: "desc",
      });

    return this.toDeliveryListResult(deliveries, limit, offset);
  }

  async listOutboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    return this.listDeliveries("outbound", integrationId, configId, query);
  }

  async listInboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    return this.listDeliveries("inbound", integrationId, configId, query);
  }

  async retryInboundWebhookDelivery(
    integrationId: string,
    configId: string,
    deliveryId: string,
  ): Promise<RetryInboundDeliveryResult> {
    const integration =
      await this.deps.contextResolver.getIntegrationOrThrow(integrationId);
    const config = await getInboundConfigForIntegrationOrThrow(
      this.deps.webhookConfigDAO,
      integration.id,
      configId,
    );
    const delivery =
      await this.deps.webhookDeliveryDAO.getDeliveryByIdForConfig(
        deliveryId,
        config.id,
      );
    if (!delivery) {
      throw new IntegrationRouteServiceError(
        404,
        "Delivery not found for this webhook configuration",
      );
    }

    if (delivery.status === "succeeded") {
      return {
        message: "Delivery retry completed with no action",
        data: {
          delivery: serializeWebhookDelivery(delivery),
          retry: {
            status: "duplicate",
            reason: "Delivery already succeeded",
          },
        },
      };
    }

    if (delivery.status !== "failed") {
      throw new IntegrationRouteServiceError(
        409,
        "Only failed deliveries can be retried",
      );
    }

    logger.info("Webhook delivery retry requested", {
      integrationId: integration.id,
      webhookConfigId: config.id,
      deliveryAttemptId: delivery.id,
      provider: delivery.provider,
      deliveryStatus: delivery.status,
    });

    const retryResult = await getWebhookService().retryDelivery(
      delivery.deliveryId,
      {
        deliveryAttemptId: delivery.id,
        webhookConfigId: config.id,
      },
    );
    const refreshedDelivery =
      (await this.deps.webhookDeliveryDAO.getDeliveryByIdForConfig(
        delivery.id,
        config.id,
      )) || delivery;

    if (retryResult.status === "duplicate") {
      return {
        message: "Delivery retry completed with no action",
        data: {
          delivery: serializeWebhookDelivery(refreshedDelivery),
          retry: {
            status: retryResult.status,
            reason: retryResult.reason || "Delivery already succeeded",
            ticketId: retryResult.ticketId,
            jobId: retryResult.jobId,
          },
        },
      };
    }

    if (retryResult.status === "failed") {
      logger.warn("Webhook delivery retry failed", {
        integrationId: integration.id,
        webhookConfigId: config.id,
        deliveryAttemptId: refreshedDelivery.id,
        provider: refreshedDelivery.provider,
        reason: retryResult.reason,
      });
      throw new IntegrationRouteServiceError(422, "Retry failed", {
        error: "Retry failed",
        reason: retryResult.reason || "Unknown retry error",
        data: {
          delivery: serializeWebhookDelivery(refreshedDelivery),
          retry: {
            status: retryResult.status,
            reason: retryResult.reason,
          },
        },
      });
    }

    if (
      retryResult.status !== "processed" &&
      retryResult.status !== "ignored"
    ) {
      logger.error("Webhook delivery retry returned unsupported status", {
        integrationId: integration.id,
        webhookConfigId: config.id,
        deliveryAttemptId: refreshedDelivery.id,
        provider: refreshedDelivery.provider,
        retryStatus: retryResult.status,
      });
      throw new IntegrationRouteServiceError(
        500,
        "Unsupported retry result status",
      );
    }

    logger.info("Webhook delivery retry completed", {
      integrationId: integration.id,
      webhookConfigId: config.id,
      deliveryAttemptId: refreshedDelivery.id,
      provider: refreshedDelivery.provider,
      retryStatus: retryResult.status,
      ticketId: retryResult.ticketId,
      jobId: retryResult.jobId,
    });

    return {
      message:
        retryResult.status === "processed"
          ? "Delivery retried successfully"
          : "Delivery retry completed with no action",
      data: {
        delivery: serializeWebhookDelivery(refreshedDelivery),
        retry: {
          status: retryResult.status,
          reason: retryResult.reason,
          ticketId: retryResult.ticketId,
          jobId: retryResult.jobId,
        },
      },
    };
  }
}
