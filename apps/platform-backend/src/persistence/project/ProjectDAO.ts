import { randomUUID } from "crypto";
import { deriveKeyPrefix } from "@viberglass/types";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import { ProjectConfig } from "../../models/PMIntegration";

/** A new space; private defaults to open, and it starts with no default reviewers. */
export type NewProject = Omit<
  ProjectConfig,
  "id" | "createdAt" | "updatedAt" | "slug" | "isPrivate" | "keyPrefix" | "defaultReviewerIds"
> & {
  isPrivate?: boolean;
};

type ProjectsRow = Selectable<Database["projects"]>;

export const slugify = (text: string) =>
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
  /** Creates the space; `maintainerId` becomes its first maintainer, in the same transaction. */
  async createProject(
    request: NewProject,
    maintainerId?: string,
  ): Promise<ProjectConfig> {
    const projectId = randomUUID();
    const timestamp = new Date();
    const slug = slugify(request.name);

    const agentInstructions = normalizeAgentInstructions(
      request.agentInstructions,
    );

    const result = await db.transaction().execute(async (trx) => {
      const prefixes = await trx.selectFrom("projects").select("key_prefix").execute();
      const keyPrefix = deriveKeyPrefix(request.name, new Set(prefixes.map((p) => p.key_prefix)));
      const row = await trx
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
          primary_ticketing_integration_id:
            request.primaryTicketingIntegrationId ?? null,
          primary_scm_integration_id: request.primaryScmIntegrationId ?? null,
          is_private: request.isPrivate ?? false,
          key_prefix: keyPrefix,
          default_owner_id: request.defaultOwnerId ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (maintainerId) {
        await trx
          .insertInto("space_members")
          .values({
            project_id: projectId,
            user_id: maintainerId,
            role: "maintainer",
            added_by: maintainerId,
          })
          .execute();
      }
      return row;
    });

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
    if (updates.isPrivate !== undefined) {
      updateData.is_private = updates.isPrivate;
    }
    if (updates.defaultOwnerId !== undefined) {
      updateData.default_owner_id = updates.defaultOwnerId;
    }
    if (updates.defaultReviewerIds !== undefined) {
      updateData.default_reviewer_ids = [...new Set(updates.defaultReviewerIds)];
    }

    const result = await db
      .updateTable("projects")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToProject(result);
  }

  /** Active projects only; archived projects stay reachable by id. */
  /** `projectIds` limits the list to spaces the caller may see; null or omitted means all. */
  async listProjects(limit = 50, offset = 0, projectIds: string[] | null = null): Promise<ProjectConfig[]> {
    if (projectIds && projectIds.length === 0) return [];
    let query = db
      .selectFrom("projects")
      .selectAll()
      .where("archived_at", "is", null);
    if (projectIds) query = query.where("id", "in", projectIds);
    const rows = await query
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
      archivedAt: row.archived_at ? this.toISOString(row.archived_at) : undefined,
      isPrivate: row.is_private,
      keyPrefix: row.key_prefix,
      defaultOwnerId: row.default_owner_id,
      defaultReviewerIds: row.default_reviewer_ids,
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

  async archiveProject(id: string): Promise<ProjectConfig> {
    const result = await db
      .updateTable("projects")
      .set({ archived_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToProject(result);
  }

  private toISOString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
