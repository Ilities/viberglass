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
  webhookConfigId: string | null;
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
  webhookConfigId?: string | null;
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status?: DeliveryStatus;
}

export interface ListDeliveryAttemptsOptions {
  statuses?: DeliveryStatus[];
  limit?: number;
  offset?: number;
  sortOrder?: "asc" | "desc";
}

export class WebhookDeliveryDAO {
  /**
   * Check if a delivery with the given delivery_id already exists
   * Used for idempotency checking before processing webhooks
   */
  async checkDeliveryExists(
    deliveryId: string,
    webhookConfigId?: string,
  ): Promise<boolean> {
    let query = db
      .selectFrom("webhook_delivery_attempts")
      .select("id")
      .where("delivery_id", "=", deliveryId);

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    const result = await query.executeTakeFirst();

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
          webhook_config_id: dto.webhookConfigId ?? null,
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
      if (this.isDeliveryIdUniqueViolation(error)) {
        // Delivery already exists, return existing record
        const existing = await this.getDeliveryByDeliveryId(
          dto.deliveryId,
          dto.webhookConfigId ?? undefined,
        );

        if (existing) {
          return existing;
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
    deliveryId: string,
    webhookConfigId?: string,
  ): Promise<WebhookDeliveryAttempt | null> {
    let query = db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("delivery_id", "=", deliveryId);

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    const row = await query.executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeliveryAttempt(row);
  }

  /**
   * Get delivery attempt by ID scoped to webhook config.
   * Useful for config-specific retry flows.
   */
  async getDeliveryByIdForConfig(
    id: string,
    webhookConfigId: string,
  ): Promise<WebhookDeliveryAttempt | null> {
    const row = await db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("id", "=", id)
      .where("webhook_config_id", "=", webhookConfigId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToDeliveryAttempt(row);
  }

  /**
   * List deliveries for a single webhook config with optional status filters.
   */
  async listDeliveriesByConfig(
    webhookConfigId: string,
    options: ListDeliveryAttemptsOptions = {},
  ): Promise<WebhookDeliveryAttempt[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const sortOrder = options.sortOrder ?? "desc";

    let query = db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("webhook_config_id", "=", webhookConfigId);

    if (options.statuses && options.statuses.length > 0) {
      query = query.where("status", "in", options.statuses as DeliveryStatus[]);
    }

    const rows = await query
      .orderBy("created_at", sortOrder)
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToDeliveryAttempt(row));
  }

  /**
   * Get pending or failed deliveries for manual retry
   * Returns oldest deliveries first
   */
  async getPendingDeliveries(
    limit = 50,
    webhookConfigId?: string,
  ): Promise<WebhookDeliveryAttempt[]> {
    let query = db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("status", "in", ["pending", "failed"])
      .orderBy("created_at", "asc");

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    const rows = await query.limit(limit).execute();

    return rows.map((row) => this.mapRowToDeliveryAttempt(row));
  }

  /**
   * Get failed deliveries by provider
   */
  async getFailedDeliveriesByProvider(
    provider: WebhookProvider,
    limit = 50,
    webhookConfigId?: string,
  ): Promise<WebhookDeliveryAttempt[]> {
    let query = db
      .selectFrom("webhook_delivery_attempts")
      .selectAll()
      .where("provider", "=", provider)
      .where("status", "=", "failed")
      .orderBy("created_at", "desc");

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    const rows = await query.limit(limit).execute();

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
    errorMessage?: string,
    webhookConfigId?: string,
  ): Promise<void> {
    let query = db
      .updateTable("webhook_delivery_attempts")
      .set({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date(),
      })
      .where("delivery_id", "=", deliveryId);

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    await query.execute();
  }

  /**
   * Link delivery to ticket and project
   * Called after webhook processing creates a ticket
   */
  async linkDeliveryToTicket(
    deliveryId: string,
    ticketId: string,
    projectId: string,
    webhookConfigId?: string,
  ): Promise<void> {
    let query = db
      .updateTable("webhook_delivery_attempts")
      .set({
        ticket_id: ticketId,
        project_id: projectId,
      })
      .where("delivery_id", "=", deliveryId);

    if (webhookConfigId !== undefined) {
      query = query.where("webhook_config_id", "=", webhookConfigId);
    }

    await query.execute();
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
      webhookConfigId: row.webhook_config_id
        ? String(row.webhook_config_id)
        : null,
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

  private isDeliveryIdUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const dbError = error as {
      code?: string;
      message?: string;
      detail?: string;
      constraint?: string;
    };
    if (dbError.code !== "23505") {
      return false;
    }

    const searchable = [
      dbError.message ?? "",
      dbError.detail ?? "",
      dbError.constraint ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes("delivery_id");
  }
}
