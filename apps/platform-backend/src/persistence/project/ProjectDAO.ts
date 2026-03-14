import { v4 as uuidv4 } from "uuid";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import { ProjectConfig } from "../../models/PMIntegration";

type ProjectsRow = Selectable<Database["projects"]>;

const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-"); // Replace multiple - with single -

const normalizeAgentInstructions = (instructions?: string | null) => {
  if (instructions === undefined) return undefined;
  if (instructions === null) return null;
  const trimmed = instructions.trim();
  return trimmed.length > 0 ? instructions : null;
};

export class ProjectDAO {
  async createProject(
    request: Omit<ProjectConfig, "id" | "createdAt" | "updatedAt" | "slug">,
  ): Promise<ProjectConfig> {
    const projectId = uuidv4();
    const timestamp = new Date();
    const slug = slugify(request.name);

    const agentInstructions = normalizeAgentInstructions(
      request.agentInstructions,
    );

    const result = await db
      .insertInto("projects")
      .values({
        id: projectId,
        name: request.name,
        slug: slug,
        ticket_system: request.ticketSystem,
        webhook_url: request.webhookUrl || null,
        auto_fix_enabled: request.autoFixEnabled,
        auto_fix_tags: request.autoFixTags,
        custom_field_mappings: JSON.stringify(request.customFieldMappings),
        agent_instructions: agentInstructions,
        primary_ticketing_integration_id: request.primaryTicketingIntegrationId ?? null,
        primary_scm_integration_id: request.primaryScmIntegrationId ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToProject(result);
  }

  async getProject(id: string): Promise<ProjectConfig | null> {
    const row = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToProject(row);
  }

  async updateProject(
    id: string,
    updates: Partial<ProjectConfig>,
  ): Promise<ProjectConfig> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name;
      updateData.slug = slugify(updates.name);
    }
    if (updates.ticketSystem !== undefined)
      updateData.ticket_system = updates.ticketSystem;
    if (updates.credentials !== undefined)
      updateData.credentials = JSON.stringify(updates.credentials);
    if (updates.webhookUrl !== undefined)
      updateData.webhook_url = updates.webhookUrl;
    if (updates.autoFixEnabled !== undefined)
      updateData.auto_fix_enabled = updates.autoFixEnabled;
    if (updates.autoFixTags !== undefined)
      updateData.auto_fix_tags = updates.autoFixTags;
    if (updates.customFieldMappings !== undefined)
      updateData.custom_field_mappings = JSON.stringify(
        updates.customFieldMappings,
      );
    if (updates.agentInstructions !== undefined) {
      updateData.agent_instructions = normalizeAgentInstructions(
        updates.agentInstructions,
      );
    }
    if (updates.primaryTicketingIntegrationId !== undefined) {
      updateData.primary_ticketing_integration_id = updates.primaryTicketingIntegrationId;
    }
    if (updates.primaryScmIntegrationId !== undefined) {
      updateData.primary_scm_integration_id = updates.primaryScmIntegrationId;
    }

    const result = await db
      .updateTable("projects")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToProject(result);
  }

  async listProjects(limit = 50, offset = 0): Promise<ProjectConfig[]> {
    const rows = await db
      .selectFrom("projects")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToProject(row));
  }

  async deleteProject(id: string): Promise<void> {
    await db.deleteFrom("projects").where("id", "=", id).execute();
  }

  private mapRowToProject(row: ProjectsRow): ProjectConfig {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ticketSystem: row.ticket_system,
      credentials:
        typeof row.credentials === "string"
          ? JSON.parse(row.credentials)
          : row.credentials,
      webhookUrl: row.webhook_url || undefined,
      autoFixEnabled: row.auto_fix_enabled,
      autoFixTags: row.auto_fix_tags || [],
      customFieldMappings:
        typeof row.custom_field_mappings === "string"
          ? JSON.parse(row.custom_field_mappings)
          : row.custom_field_mappings,
      agentInstructions: row.agent_instructions ?? undefined,
      primaryTicketingIntegrationId: row.primary_ticketing_integration_id ?? undefined,
      primaryScmIntegrationId: row.primary_scm_integration_id ?? undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
  }

  async findByName(name: string) {
    const row = await db
      .selectFrom("projects")
      .selectAll()
      .where("slug", "=", name)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToProject(row);
  }
}
