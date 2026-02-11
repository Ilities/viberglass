import { randomUUID } from "crypto";
import { createChildLogger } from "../../config/logger";
import type { WebhookDeliveryDAO } from "../../persistence/webhook/WebhookDeliveryDAO";
import type { ProviderType } from "../WebhookProvider";
import type { OutboundWebhookEventType } from "./types";

const logger = createChildLogger({ service: "FeedbackDeliveryTracker" });

interface TrackStartParams {
  provider: ProviderType;
  webhookConfigId: string;
  eventType: OutboundWebhookEventType;
  payload: Record<string, unknown>;
}

export class FeedbackDeliveryTracker {
  constructor(private deliveryDAO: WebhookDeliveryDAO) {}

  async trackStart(params: TrackStartParams): Promise<string | null> {
    try {
      const delivery = await this.deliveryDAO.recordDeliveryAttempt({
        provider: params.provider,
        webhookConfigId: params.webhookConfigId,
        deliveryId: randomUUID(),
        eventType: params.eventType,
        payload: params.payload,
        status: "processing",
      });

      return delivery.id;
    } catch (error) {
      logger.warn("Failed to record outbound delivery start", {
        provider: params.provider,
        webhookConfigId: params.webhookConfigId,
        eventType: params.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async trackSuccess(deliveryAttemptId: string | null): Promise<void> {
    if (!deliveryAttemptId) {
      return;
    }

    try {
      await this.deliveryDAO.updateDeliveryStatus(deliveryAttemptId, "succeeded");
    } catch (error) {
      logger.warn("Failed to mark outbound delivery as succeeded", {
        deliveryAttemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async trackFailure(deliveryAttemptId: string | null, errorMessage: string): Promise<void> {
    if (!deliveryAttemptId) {
      return;
    }

    try {
      await this.deliveryDAO.updateDeliveryStatus(
        deliveryAttemptId,
        "failed",
        errorMessage.slice(0, 2000),
      );
    } catch (error) {
      logger.warn("Failed to mark outbound delivery as failed", {
        deliveryAttemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
