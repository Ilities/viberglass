import { randomUUID } from "node:crypto";
import { isObjectRecord } from "@viberglass/types";
import type { InboundWebhookEvent } from "@viberglass/integration-core";
import type { EventProcessingResult } from "./InboundEventHandler";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type {
  WebhookDeliveryAttempt,
  WebhookDeliveryDAO,
} from "../persistence/webhook/WebhookDeliveryDAO";
import type { DeduplicationService } from "./DeduplicationService";

interface DeliveryStartInput {
  provider: WebhookConfig["provider"];
  webhookConfigId: string;
  deliveryId: string;
  eventType: string;
  payload: unknown;
}

export class InboundWebhookDeliveryLifecycle {
  constructor(
    private deduplication: Pick<
      DeduplicationService,
      "shouldProcessDelivery" | "recordDeliveryStart" | "recordDeliverySuccessById" | "recordDeliveryFailureById"
    >,
    private deliveryDAO: Pick<WebhookDeliveryDAO, "updateDeliveryStatus" | "recordDeliveryAttempt">,
  ) {}

  async recordStart(
    input: DeliveryStartInput,
  ): Promise<WebhookDeliveryAttempt> {
    return this.deduplication.recordDeliveryStart({
      provider: input.provider,
      webhookConfigId: input.webhookConfigId,
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      payload: this.toPayloadRecord(input.payload),
    });
  }

  async recordSuccess(
    deliveryAttemptId: string,
    result: EventProcessingResult,
  ): Promise<void> {
    if (result.ticketId && result.projectId) {
      await this.deduplication.recordDeliverySuccessById(
        deliveryAttemptId,
        result.ticketId,
        result.projectId,
      );
      return;
    }

    if (result.ignoredReason) {
      await this.deliveryDAO.updateDeliveryStatus(deliveryAttemptId, "ignored", result.ignoredReason);
      return;
    }

    await this.deliveryDAO.updateDeliveryStatus(deliveryAttemptId, "succeeded");
  }

  async recordFailure(
    deliveryAttemptId: string,
    error: Error | string,
  ): Promise<void> {
    await this.deduplication.recordDeliveryFailureById(deliveryAttemptId, error);
  }

  /**
   * A request whose signature didn't check out. Nothing it carried is kept,
   * not even its delivery id, so it can't hold back the real delivery and can't
   * be retried; the row only tells the admin that requests are being refused.
   */
  async recordRejected(config: WebhookConfig, reason: string): Promise<void> {
    try {
      await this.deliveryDAO.recordDeliveryAttempt({
        provider: config.provider,
        webhookConfigId: config.id,
        deliveryId: `rejected-${randomUUID()}`,
        eventType: "unverified",
        payload: {},
        status: "rejected",
        errorMessage: reason,
      });
    } catch {
      // The route logs the rejection either way.
    }
  }

  /** A verified delivery the webhook doesn't act on, such as an event it isn't set to receive. */
  async recordIgnored(event: InboundWebhookEvent, config: WebhookConfig, reason: string): Promise<void> {
    try {
      const { shouldProcess } = await this.deduplication.shouldProcessDelivery(event.deduplicationId, config.id);
      if (!shouldProcess) {
        return;
      }

      const delivery = await this.recordStart({
        provider: config.provider,
        webhookConfigId: config.id,
        deliveryId: event.deduplicationId,
        eventType: event.eventType,
        payload: event.payload,
      });
      await this.deliveryDAO.updateDeliveryStatus(delivery.id, "ignored", reason);
    } catch {
      // Ignore recording failures.
    }
  }

  private toPayloadRecord(payload: unknown): Record<string, unknown> {
    if (isObjectRecord(payload)) {
      return payload;
    }

    return { rawPayload: payload };
  }
}
