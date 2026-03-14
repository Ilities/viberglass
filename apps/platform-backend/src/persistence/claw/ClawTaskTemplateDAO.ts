import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type {
  ClawTaskTemplate,
  CreateClawTaskTemplateRequest,
  UpdateClawTaskTemplateRequest,
} from "@viberglass/types";

type ClawTaskTemplatesRow = Selectable<Database["claw_task_templates"]>;

interface ClawTaskTemplateListQuery {
  limit?: number;
  offset?: number;
  projectId?: string;
}

interface ClawTaskTemplateListResult {
  templates: ClawTaskTemplate[];
  total: number;
}

export class ClawTaskTemplateDAO {
  async createTemplate(
    request: CreateClawTaskTemplateRequest,
  ): Promise<ClawTaskTemplate> {
    const templateId = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("claw_task_templates")
      .values({
        id: templateId,
        project_id: request.projectId,
        name: request.name,
        description: request.description ?? null,
        clanker_id: request.clankerId,
        task_instructions: request.taskInstructions,
        config: JSON.stringify(request.config ?? {}),
        secret_ids: JSON.stringify(request.secretIds ?? []),
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToTemplate(result);
  }

  async getTemplate(id: string): Promise<ClawTaskTemplate | null> {
    const row = await db
      .selectFrom("claw_task_templates")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToTemplate(row);
  }

  async getTemplateByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<ClawTaskTemplate | null> {
    const row = await db
      .selectFrom("claw_task_templates")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("name", "=", name)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToTemplate(row);
  }

  async updateTemplate(
    id: string,
    updates: UpdateClawTaskTemplateRequest,
  ): Promise<ClawTaskTemplate> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.clankerId !== undefined)
      updateData.clanker_id = updates.clankerId;
    if (updates.taskInstructions !== undefined)
      updateData.task_instructions = updates.taskInstructions;
    if (updates.config !== undefined)
      updateData.config = JSON.stringify(updates.config);
    if (updates.secretIds !== undefined)
      updateData.secret_ids = JSON.stringify(updates.secretIds);

    const result = await db
      .updateTable("claw_task_templates")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToTemplate(result);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("claw_task_templates")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async listTemplates(
    limit = 50,
    offset = 0,
    projectId?: string,
  ): Promise<ClawTaskTemplate[]> {
    const result = await this.getTemplatesWithFilters({
      limit,
      offset,
      projectId,
    });
    return result.templates;
  }

  async getTemplatesWithFilters(
    params: ClawTaskTemplateListQuery,
  ): Promise<ClawTaskTemplateListResult> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let query = db.selectFrom("claw_task_templates").selectAll();

    if (params.projectId) {
      query = query.where("project_id", "=", params.projectId);
    }

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count
    let totalQuery = db
      .selectFrom("claw_task_templates")
      .select(sql<string>`COUNT(*)`.as("total"));

    if (params.projectId) {
      totalQuery = totalQuery.where("project_id", "=", params.projectId);
    }

    const totalRow = await totalQuery.executeTakeFirst();

    return {
      templates: rows.map((row) => this.mapRowToTemplate(row)),
      total: parseInt(totalRow?.total || "0", 10),
    };
  }

  async countTemplatesByProject(projectId: string): Promise<number> {
    const row = await db
      .selectFrom("claw_task_templates")
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

  private mapRowToTemplate(row: ClawTaskTemplatesRow): ClawTaskTemplate {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description ?? null,
      clankerId: row.clanker_id,
      taskInstructions: row.task_instructions,
      config:
        typeof row.config === "string"
          ? JSON.parse(row.config)
          : (row.config ?? {}),
      secretIds: Array.isArray(row.secret_ids)
        ? (row.secret_ids as string[])
        : typeof row.secret_ids === "string"
          ? JSON.parse(row.secret_ids)
          : [],
      createdAt: this.toISOString(row.created_at),
      updatedAt: this.toISOString(row.updated_at),
    };
  }
}
