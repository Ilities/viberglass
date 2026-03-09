import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  ClawSchedule,
  CreateClawScheduleRequest,
  UpdateClawScheduleRequest,
} from "@viberglass/types";

type ClawSchedulesRow = Selectable<Database["claw_schedules"]>;

interface ClawScheduleListQuery {
  limit?: number;
  offset?: number;
  projectId?: string;
  isActive?: boolean;
  scheduleType?: "interval" | "cron";
}

interface ClawScheduleListResult {
  schedules: ClawSchedule[];
  total: number;
}

export class ClawScheduleDAO {
  async createSchedule(
    request: CreateClawScheduleRequest,
    actor?: string,
  ): Promise<ClawSchedule> {
    const scheduleId = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("claw_schedules")
      .values({
        id: scheduleId,
        project_id: request.projectId,
        task_template_id: request.taskTemplateId,
        name: request.name,
        description: request.description ?? null,
        schedule_type: request.scheduleType,
        interval_expression: request.intervalExpression ?? null,
        cron_expression: request.cronExpression ?? null,
        timezone: request.timezone ?? "UTC",
        is_active: request.isActive ?? true,
        webhook_config: request.webhookConfig
          ? JSON.stringify(request.webhookConfig)
          : null,
        created_at: timestamp,
        updated_at: timestamp,
        created_by: actor,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToSchedule(result);
  }

  async getSchedule(id: string): Promise<ClawSchedule | null> {
    const row = await db
      .selectFrom("claw_schedules")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToSchedule(row);
  }

  async getScheduleByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<ClawSchedule | null> {
    const row = await db
      .selectFrom("claw_schedules")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("name", "=", name)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToSchedule(row);
  }

  async updateSchedule(
    id: string,
    updates: UpdateClawScheduleRequest,
  ): Promise<ClawSchedule> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.scheduleType !== undefined)
      updateData.schedule_type = updates.scheduleType;
    if (updates.intervalExpression !== undefined)
      updateData.interval_expression = updates.intervalExpression;
    if (updates.cronExpression !== undefined)
      updateData.cron_expression = updates.cronExpression;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.webhookConfig !== undefined)
      updateData.webhook_config = updates.webhookConfig
        ? JSON.stringify(updates.webhookConfig)
        : null;

    const result = await db
      .updateTable("claw_schedules")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToSchedule(result);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("claw_schedules")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async pauseSchedule(id: string): Promise<ClawSchedule> {
    const result = await db
      .updateTable("claw_schedules")
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToSchedule(result);
  }

  async resumeSchedule(id: string): Promise<ClawSchedule> {
    const result = await db
      .updateTable("claw_schedules")
      .set({
        is_active: true,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToSchedule(result);
  }

  async updateLastRun(id: string, lastRunAt: Date): Promise<void> {
    await db
      .updateTable("claw_schedules")
      .set({
        last_run_at: lastRunAt,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async updateNextRun(id: string, nextRunAt: Date | null): Promise<void> {
    await db
      .updateTable("claw_schedules")
      .set({
        next_run_at: nextRunAt,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async incrementRunCount(id: string): Promise<void> {
    await db
      .updateTable("claw_schedules")
      .set({
        run_count: sql`run_count + 1`,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async incrementFailureCount(id: string): Promise<void> {
    await db
      .updateTable("claw_schedules")
      .set({
        failure_count: sql`failure_count + 1`,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async listSchedules(
    limit = 50,
    offset = 0,
    filters?: ClawScheduleListQuery,
  ): Promise<ClawSchedule[]> {
    const result = await this.getSchedulesWithFilters({
      limit,
      offset,
      ...filters,
    });
    return result.schedules;
  }

  async getActiveSchedules(): Promise<ClawSchedule[]> {
    const rows = await db
      .selectFrom("claw_schedules")
      .selectAll()
      .where("is_active", "=", true)
      .where("next_run_at", "is not", null)
      .orderBy("next_run_at", "asc")
      .execute();

    return rows.map((row) => this.mapRowToSchedule(row));
  }

  async getSchedulesWithFilters(
    params: ClawScheduleListQuery,
  ): Promise<ClawScheduleListResult> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let query = db.selectFrom("claw_schedules").selectAll();

    if (params.projectId) {
      query = query.where("project_id", "=", params.projectId);
    }

    if (params.isActive !== undefined) {
      query = query.where("is_active", "=", params.isActive);
    }

    if (params.scheduleType) {
      query = query.where("schedule_type", "=", params.scheduleType);
    }

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count
    let totalQuery = db
      .selectFrom("claw_schedules")
      .select(sql<string>`COUNT(*)`.as("total"));

    if (params.projectId) {
      totalQuery = totalQuery.where("project_id", "=", params.projectId);
    }

    if (params.isActive !== undefined) {
      totalQuery = totalQuery.where("is_active", "=", params.isActive);
    }

    if (params.scheduleType) {
      totalQuery = totalQuery.where("schedule_type", "=", params.scheduleType);
    }

    const totalRow = await totalQuery.executeTakeFirst();

    return {
      schedules: rows.map((row) => this.mapRowToSchedule(row)),
      total: parseInt(totalRow?.total || "0", 10),
    };
  }

  async countSchedulesByProject(projectId: string): Promise<number> {
    const row = await db
      .selectFrom("claw_schedules")
      .select(sql<string>`COUNT(*)`.as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirst();

    return parseInt(row?.count || "0", 10);
  }

  private toISOString(date: unknown): string {
    if (date instanceof Date) return date.toISOString();
    if (typeof date === "string") return date;
    return String(date);
  }

  private mapRowToSchedule(row: ClawSchedulesRow): ClawSchedule {
    return {
      id: row.id,
      projectId: row.project_id,
      taskTemplateId: row.task_template_id,
      name: row.name,
      description: row.description ?? null,
      scheduleType: row.schedule_type,
      intervalExpression: row.interval_expression ?? null,
      cronExpression: row.cron_expression ?? null,
      timezone: row.timezone,
      isActive: row.is_active,
      lastRunAt: row.last_run_at ? this.toISOString(row.last_run_at) : null,
      nextRunAt: row.next_run_at ? this.toISOString(row.next_run_at) : null,
      runCount: Number(row.run_count),
      failureCount: Number(row.failure_count),
      webhookConfig: row.webhook_config
        ? typeof row.webhook_config === "string"
          ? JSON.parse(row.webhook_config)
          : row.webhook_config
        : null,
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
      createdBy: row.created_by ?? null,
    };
  }
}
