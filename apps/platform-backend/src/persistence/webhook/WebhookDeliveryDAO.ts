import { v4 as uuidv4 } from "uuid";
import db from "../config/database";

/**
 * Webhook delivery tracking data access object
 *
 * Manages webhook delivery attempts stored in webhook_delivery_attempts table.
 * Provides idempotency via delivery_id deduplication and supports manual retry
 * for failed deliveries.
 */

export type WebhookProvider = "github" | "jira" | "shortcut" | "custom";
export type DeliveryStatus = "pending" | "processing" | "succeeded" | "failed";

/**
 * Webhook delivery attempt as stored in database
 */
export interface WebhookDeliveryAttempt {
  id: string;
  provider: WebhookProvider;
  deliveryId: string;
  eventType: string;
  status: DeliveryStatus;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  projectId: string | null;
  ticketId: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

/**
 * DTO for creating a new delivery attempt
 */
export interface CreateDeliveryAttemptDTO {
  provider: WebhookProvider;
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status?: DeliveryStatus;
}

export class WebhookDeliveryDAO {
  /**
   * Check if a delivery with the given delivery_id already exists
   * Used for idempotency checking before processing webhooks
   */
  async checkDeliveryExists(deliveryId: string): Promise<boolean> {
    const result = await db
      .selectFrom("webhook_delivery_attempts")
      .select("id")
      .where("delivery_id", "=", deliveryId)
      .executeTakeFirst();

    return result !== undefined;
  }

  /**
   * Record a new delivery attempt
   * Handles unique constraint violation on delivery_id by returning existing record
   */
  async recordDeliveryAttempt(
    dto: CreateDeliveryAttemptDTO
  ): Promise<WebhookDeliveryAttempt> {
    const id = uuidv4();
    const timestamp = new Date();

    try {
      const result = await db
        .insertInto("webhook_delivery_attempts")
        .values({
          id,
          provider: dto.provider,
          delivery_id: dto.deliveryId,
          event_type: dto.eventType,
          status: dto.status ?? "processing",
          error_message: null,
          payload: JSON.stringify(dto.payload) as any, // Kysely jsonb column
          project_id: null,
          ticket_id: null,
          created_at: timestamp,
          processed_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapRowToDeliveryAttempt(result);
    } catch (error: unknown) {
      // Check for unique constraint violation on delivery_id
      if (
        error instanceof Error &&
        error.message.includes("unique constraint") &&
        error.message.includes("delivery_id")
      ) {
        // Delivery already exists, return existing record
        const existing = await db
          .selectFrom("webhook_delivery_attempts")
          .selectAll()
          .where("delivery_id", "=", dto.deliveryId)
          .executeTakeFirst();

        if (existing) {
          return this.mapRowToDeliveryAttempt(existing);
        }
      }
      throw error;
    }
  }

  /**
   * Get delivery attempt by ID
   */
  async getDeliveryById(id: string): Promise<WebhookDeliveryAttempt | null> {
    const row = await db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeliveryAttempt(row);
  }

  /**
   * Get delivery attempt by delivery_id
   */
  async getDeliveryByDeliveryId(
    deliveryId: string
  ): Promise<WebhookDeliveryAttempt | null> {
    const row = await db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("delivery_id", "=", deliveryId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeliveryAttempt(row);
  }

  /**
   * Get pending or failed deliveries for manual retry
   * Returns oldest deliveries first
   */
  async getPendingDeliveries(
    limit = 50
  ): Promise<WebhookDeliveryAttempt[]> {
    const rows = await db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("status", "in", ["pending", "failed"])
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToDeliveryAttempt(row));
  }

  /**
   * Get failed deliveries by provider
   */
  async getFailedDeliveriesByProvider(
    provider: WebhookProvider,
    limit = 50
  ): Promise<WebhookDeliveryAttempt[]> {
    const rows = await db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("provider", "=", provider)
      .where("status", "=", "failed")
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToDeliveryAttempt(row));
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    id: string,
    status: "succeeded" | "failed",
    errorMessage?: string
  ): Promise<void> {
    await db
      .updateTable("webhook_delivery_attempts")
      .set({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  /**
   * Update delivery status by delivery_id
   */
  async updateDeliveryStatusByDeliveryId(
    deliveryId: string,
    status: "succeeded" | "failed",
    errorMessage?: string
  ): Promise<void> {
    await db
      .updateTable("webhook_delivery_attempts")
      .set({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date(),
      })
      .where("delivery_id", "=", deliveryId)
      .execute();
  }

  /**
   * Link delivery to ticket and project
   * Called after webhook processing creates a ticket
   */
  async linkDeliveryToTicket(
    deliveryId: string,
    ticketId: string,
    projectId: string
  ): Promise<void> {
    await db
      .updateTable("webhook_delivery_attempts")
      .set({
        ticket_id: ticketId,
        project_id: projectId,
      })
      .where("delivery_id", "=", deliveryId)
      .execute();
  }

  /**
   * Link delivery to ticket by internal ID
   */
  async linkDeliveryToTicketById(
    id: string,
    ticketId: string,
    projectId: string
  ): Promise<void> {
    await db
      .updateTable("webhook_delivery_attempts")
      .set({
        ticket_id: ticketId,
        project_id: projectId,
      })
      .where("id", "=", id)
      .execute();
  }

  /**
   * Delete old successful deliveries
   * For cleanup/maintenance purposes
   */
  async deleteOldSuccessfulDeliveries(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db
      .deleteFrom("webhook_delivery_attempts")
      .where("status", "=", "succeeded")
      .where("created_at", "<", cutoffDate)
      .executeTakeFirst();

    return typeof result.numDeletedRows === "bigint"
      ? Number(result.numDeletedRows)
      : (result.numDeletedRows ?? 0);
  }

  /**
   * Get delivery statistics by provider
   */
  async getDeliveryStatsByProvider(
    provider: WebhookProvider
  ): Promise<{
    total: number;
    pending: number;
    processing: number;
    succeeded: number;
    failed: number;
  }> {
    const results = await db
      .selectFrom("webhook_delivery_attempts")
      .select("status")
      .select(({ fn }) => [fn.count<number>("id").as("count")])
      .where("provider", "=", provider)
      .groupBy("status")
      .execute();

    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
    };

    for (const row of results) {
      const status = row.status as DeliveryStatus;
      const count = typeof row.count === "bigint" ? Number(row.count) : Number(row.count);
      stats.total += count;
      stats[status] = count;
    }

    return stats;
  }

  private mapRowToDeliveryAttempt(row: Record<string, unknown>): WebhookDeliveryAttempt {
    return {
      id: String(row.id),
      provider: row.provider as WebhookProvider,
      deliveryId: String(row.delivery_id),
      eventType: String(row.event_type),
      status: row.status as DeliveryStatus,
      errorMessage: row.error_message ? String(row.error_message) : null,
      payload:
        typeof row.payload === "string"
          ? JSON.parse(row.payload)
          : (row.payload as Record<string, unknown>),
      projectId: row.project_id ? String(row.project_id) : null,
      ticketId: row.ticket_id ? String(row.ticket_id) : null,
      createdAt: row.created_at as Date,
      processedAt: row.processed_at ? (row.processed_at as Date) : null,
    };
  }
}
