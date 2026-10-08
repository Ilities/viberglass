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

  /** A delivery that was refused, such as one with a bad signature: failed, so it can be retried. */
  async recordRejected(event: ParsedWebhookEvent, config: WebhookConfig, reason: string): Promise<void> {
    await this.recordUnprocessed(event, config, (id) => this.recordFailure(id, reason));
  }

  /** A delivery the webhook doesn't act on, such as an event it isn't set to receive. */
  async recordIgnored(event: ParsedWebhookEvent, config: WebhookConfig, reason: string): Promise<void> {
    await this.recordUnprocessed(event, config, (id) => this.deliveryDAO.updateDeliveryStatus(id, "ignored", reason));
  }

  private async recordUnprocessed(
    event: ParsedWebhookEvent,
    config: WebhookConfig,
    finish: (deliveryAttemptId: string) => Promise<void>,
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

      await finish(delivery.id);
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
