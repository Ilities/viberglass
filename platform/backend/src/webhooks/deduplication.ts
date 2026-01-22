import type {
  CreateDeliveryAttemptDTO,
  WebhookDeliveryAttempt,
} from "../persistence/webhook/WebhookDeliveryDAO";
import { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";

/**
 * Webhook deduplication service
 *
 * Encapsulates idempotency logic for webhook processing.
 * Prevents duplicate processing of webhooks via delivery_id tracking.
 * Provides clean separation between deduplication concerns and webhook handling.
 */

export interface DeliveryCheckResult {
  shouldProcess: boolean;
  existingId?: string;
  existingStatus?: string;
}

export class DeduplicationService {
  constructor(private deliveryDAO: WebhookDeliveryDAO) {}

  /**
   * Check if a delivery should be processed
   * Returns false if delivery_id was already processed
   */
  async shouldProcessDelivery(deliveryId: string): Promise<DeliveryCheckResult> {
    const existing = await this.deliveryDAO.getDeliveryByDeliveryId(deliveryId);

    if (!existing) {
      return { shouldProcess: true };
    }

    // Already processed or currently processing
    return {
      shouldProcess: false,
      existingId: existing.id,
      existingStatus: existing.status,
    };
  }

  /**
   * Record the start of delivery processing
   * Creates initial delivery attempt record with 'processing' status
   */
  async recordDeliveryStart(
    dto: CreateDeliveryAttemptDTO
  ): Promise<WebhookDeliveryAttempt> {
    return await this.deliveryDAO.recordDeliveryAttempt({
      ...dto,
      status: "processing",
    });
  }

  /**
   * Record successful delivery processing
   * Updates status to 'succeeded' and optionally links to ticket/project
   */
  async recordDeliverySuccess(
    deliveryId: string,
    ticketId?: string,
    projectId?: string
  ): Promise<void> {
    if (ticketId && projectId) {
      await this.deliveryDAO.linkDeliveryToTicket(
        deliveryId,
        ticketId,
        projectId
      );
    }

    await this.deliveryDAO.updateDeliveryStatusByDeliveryId(
      deliveryId,
      "succeeded"
    );
  }

  /**
   * Record successful delivery by internal ID
   * Alternative method using the internal database ID
   */
  async recordDeliverySuccessById(
    id: string,
    ticketId?: string,
    projectId?: string
  ): Promise<void> {
    if (ticketId && projectId) {
      await this.deliveryDAO.linkDeliveryToTicketById(id, ticketId, projectId);
    }

    await this.deliveryDAO.updateDeliveryStatus(id, "succeeded");
  }

  /**
   * Record failed delivery processing
   * Stores error message for debugging and manual retry
   */
  async recordDeliveryFailure(
    deliveryId: string,
    error: Error | string
  ): Promise<void> {
    const errorMessage =
      typeof error === "string" ? error : error.message || "Unknown error";

    await this.deliveryDAO.updateDeliveryStatusByDeliveryId(
      deliveryId,
      "failed",
      errorMessage
    );
  }

  /**
   * Record failed delivery by internal ID
   */
  async recordDeliveryFailureById(
    id: string,
    error: Error | string
  ): Promise<void> {
    const errorMessage =
      typeof error === "string" ? error : error.message || "Unknown error";

    await this.deliveryDAO.updateDeliveryStatus(id, "failed", errorMessage);
  }

  /**
   * Get failed deliveries for manual retry
   */
  async getFailedDeliveries(limit = 50): Promise<WebhookDeliveryAttempt[]> {
    return await this.deliveryDAO.getPendingDeliveries(limit);
  }

  /**
   * Get failed deliveries by provider
   */
  async getFailedDeliveriesByProvider(
    provider: "github" | "jira",
    limit = 50
  ): Promise<WebhookDeliveryAttempt[]> {
    return await this.deliveryDAO.getFailedDeliveriesByProvider(provider, limit);
  }

  /**
   * Wrapper for processing webhooks with automatic deduplication
   *
   * Usage:
   * const result = await deduplicationService.processWebhook(
   *   { provider, deliveryId, eventType, payload },
   *   async () => { /* your webhook handler *\/ }
   * );
   */
  async processWebhook<T>(
    dto: CreateDeliveryAttemptDTO,
    handler: (deliveryId: string) => Promise<{
      ticketId?: string;
      projectId?: string;
      result?: T;
    }>
  ): Promise<{ processed: boolean; delivery: WebhookDeliveryAttempt; result?: T }> {
    // Check if already processed
    const check = await this.shouldProcessDelivery(dto.deliveryId);

    if (!check.shouldProcess) {
      // Get existing delivery
      const existing = await this.deliveryDAO.getDeliveryByDeliveryId(
        dto.deliveryId
      );
      if (!existing) {
        throw new Error("Delivery not found after shouldProcessDelivery returned false");
      }
      return { processed: false, delivery: existing };
    }

    // Record start of processing
    const delivery = await this.recordDeliveryStart(dto);

    try {
      // Execute webhook handler
      const handlerResult = await handler(delivery.id);

      // Record success
      await this.recordDeliverySuccessById(
        delivery.id,
        handlerResult.ticketId,
        handlerResult.projectId
      );

      return { processed: true, delivery, result: handlerResult.result };
    } catch (error) {
      // Record failure
      await this.recordDeliveryFailureById(
        delivery.id,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}
