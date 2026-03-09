import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  ClawExecution,
  ClawExecutionStatus,
  ClawExecutionSummary,
  ClawWebhookDeliveryStatus,
} from "@viberglass/types";

type ClawExecutionsRow = Selectable<Database["claw_executions"]>;

interface ClawExecutionListQuery {
  limit?: number;
  offset?: number;
  scheduleId?: string;
  status?: ClawExecutionStatus;
}

interface ClawExecutionListResult {
  executions: ClawExecution[];
  total: number;
}

export class ClawExecutionDAO {
  async createExecution(scheduleId: string): Promise<ClawExecution> {
    const executionId = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("claw_executions")
      .values({
        id: executionId,
        schedule_id: scheduleId,
        job_id: null,
        status: "pending",
        started_at: null,
        completed_at: null,
        error_message: null,
        result: null,
        webhook_delivery_status: null,
        created_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToExecution(result);
  }

  async getExecution(id: string): Promise<ClawExecution | null> {
    const row = await db
      .selectFrom("claw_executions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToExecution(row);
  }

  async updateExecution(
    id: string,
    updates: {
      status?: ClawExecutionStatus;
      jobId?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      errorMessage?: string | null;
      result?: Record<string, unknown> | null;
      webhookDeliveryStatus?: ClawWebhookDeliveryStatus | null;
    },
  ): Promise<ClawExecution> {
    const updateData: Record<string, unknown> = {};

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.jobId !== undefined) updateData.job_id = updates.jobId;
    if (updates.startedAt !== undefined)
      updateData.started_at = updates.startedAt;
    if (updates.completedAt !== undefined)
      updateData.completed_at = updates.completedAt;
    if (updates.errorMessage !== undefined)
      updateData.error_message = updates.errorMessage;
    if (updates.result !== undefined)
      updateData.result = updates.result
        ? JSON.stringify(updates.result)
        : null;
    if (updates.webhookDeliveryStatus !== undefined)
      updateData.webhook_delivery_status = updates.webhookDeliveryStatus
        ? JSON.stringify(updates.webhookDeliveryStatus)
        : null;

    const result = await db
      .updateTable("claw_executions")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToExecution(result);
  }

  async deleteExecution(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("claw_executions")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async listExecutions(
    limit = 50,
    offset = 0,
    filters?: ClawExecutionListQuery,
  ): Promise<ClawExecution[]> {
    const result = await this.getExecutionsWithFilters({
      limit,
      offset,
      ...filters,
    });
    return result.executions;
  }

  async getRecentExecutionsBySchedule(
    scheduleId: string,
    limit = 10,
  ): Promise<ClawExecution[]> {
    const rows = await db
      .selectFrom("claw_executions")
      .selectAll()
      .where("schedule_id", "=", scheduleId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async getExecutionsWithFilters(
    params: ClawExecutionListQuery,
  ): Promise<ClawExecutionListResult> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let query = db.selectFrom("claw_executions").selectAll();

    if (params.scheduleId) {
      query = query.where("schedule_id", "=", params.scheduleId);
    }

    if (params.status) {
      query = query.where("status", "=", params.status);
    }

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count
    let totalQuery = db
      .selectFrom("claw_executions")
      .select(sql<string>`COUNT(*)`.as("total"));

    if (params.scheduleId) {
      totalQuery = totalQuery.where("schedule_id", "=", params.scheduleId);
    }

    if (params.status) {
      totalQuery = totalQuery.where("status", "=", params.status);
    }

    const totalRow = await totalQuery.executeTakeFirst();

    return {
      executions: rows.map((row) => this.mapRowToExecution(row)),
      total: parseInt(totalRow?.total || "0", 10),
    };
  }

  async countExecutionsBySchedule(scheduleId: string): Promise<number> {
    const row = await db
      .selectFrom("claw_executions")
      .select(sql<string>`COUNT(*)`.as("count"))
      .where("schedule_id", "=", scheduleId)
      .executeTakeFirst();

    return parseInt(row?.count || "0", 10);
  }

  async countExecutionsByStatus(status: ClawExecutionStatus): Promise<number> {
    const row = await db
      .selectFrom("claw_executions")
      .select(sql<string>`COUNT(*)`.as("count"))
      .where("status", "=", status)
      .executeTakeFirst();

    return parseInt(row?.count || "0", 10);
  }

  async getExecutionStats(): Promise<Record<ClawExecutionStatus, number>> {
    const rows = await db
      .selectFrom("claw_executions")
      .select(["status", sql<string>`COUNT(*)`.as("count")])
      .groupBy("status")
      .execute();

    const stats: Record<ClawExecutionStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      const status = row.status as ClawExecutionStatus;
      if (status in stats) {
        stats[status] = parseInt(row.count || "0");
      }
    }

    return stats;
  }

  private toISOString(date: unknown): string {
    if (date instanceof Date) return date.toISOString();
    if (typeof date === "string") return date;
    return String(date);
  }

  private mapRowToExecution(row: ClawExecutionsRow): ClawExecution {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      jobId: row.job_id ?? null,
      status: row.status,
      startedAt: row.started_at ? this.toISOString(row.started_at) : null,
      completedAt: row.completed_at ? this.toISOString(row.completed_at) : null,
      errorMessage: row.error_message ?? null,
      result: row.result
        ? typeof row.result === "string"
          ? JSON.parse(row.result)
          : row.result
        : null,
      webhookDeliveryStatus: row.webhook_delivery_status
        ? typeof row.webhook_delivery_status === "string"
          ? JSON.parse(row.webhook_delivery_status)
          : row.webhook_delivery_status
        : null,
      createdAt: this.toISOString(row.created_at),
    };
  }
}
