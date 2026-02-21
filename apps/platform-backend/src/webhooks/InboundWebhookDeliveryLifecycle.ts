import { isObjectRecord } from "@viberglass/types";
import type { ParsedWebhookEvent } from "./WebhookProvider";
import type { EventProcessingResult } from "./InboundEventProcessorResolver";
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
    private deduplication: DeduplicationService,
    private deliveryDAO: WebhookDeliveryDAO,
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

    await this.deliveryDAO.updateDeliveryStatus(deliveryAttemptId, "succeeded");
  }

  async recordFailure(
    deliveryAttemptId: string,
    error: Error | string,
  ): Promise<void> {
    await this.deduplication.recordDeliveryFailureById(deliveryAttemptId, error);
  }

  async recordRejectedOrIgnored(
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

      const delivery = await this.recordStart({
        provider: config.provider,
        webhookConfigId: config.id,
        deliveryId: event.deduplicationId,
        eventType: event.eventType,
        payload: event.payload,
      });

      await this.recordFailure(delivery.id, reason);
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
