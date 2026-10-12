import { insertProject } from "./insertProject";
import { mapProject } from "./mapProject";
import { normalizeAgentInstructions, slugify } from "./projectFields";
export { slugify } from "./projectFields";
import db from "../config/database";
import type { Project } from "@viberglass/types";

/** A new space; private defaults to open, and it starts with no default reviewers. */
export type NewProject = Omit<
  Project,
  "id" | "createdAt" | "updatedAt" | "slug" | "isPrivate" | "keyPrefix" | "defaultReviewerIds" | "questionReminderHours" | "backingKind"
> & {
  isPrivate?: boolean;
  backingKind?: Project["backingKind"];
};

export class ProjectDAO {
  /** Creates the space; `maintainerId` becomes its first maintainer, in the same transaction. */
  async createProject(
    request: NewProject,
    maintainerId?: string,
  ): Promise<Project> {
    return insertProject(request, maintainerId);
  }

  /** The agent a task's space sends asks to when nobody names one; null when the space hasn't picked one. */
  async getDefaultAgentIdForTicket(ticketId: string): Promise<string | null> {
    const row = await db
      .selectFrom("tickets")
      .innerJoin("projects", "projects.id", "tickets.project_id")
      .select("projects.default_clanker_id")
      .where("tickets.id", "=", ticketId)
      .executeTakeFirst();
    return row?.default_clanker_id ?? null;
  }

  async getProject(id: string): Promise<Project | null> {
    const row = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return mapProject(row);
  }

  async updateProject(
    id: string,
    updates: Partial<Project>,
  ): Promise<Project> {
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
    if (updates.defaultAgentId !== undefined) {
      updateData.default_clanker_id = updates.defaultAgentId;
    }
    if (updates.defaultReviewerIds !== undefined) {
      updateData.default_reviewer_ids = [...new Set(updates.defaultReviewerIds)];
    }
    if (updates.questionReminderHours !== undefined) {
      updateData.question_reminder_hours = updates.questionReminderHours;
    }

    const result = await db
      .updateTable("projects")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapProject(result);
  }

  /** Active projects only; archived projects stay reachable by id. */
  /** `projectIds` limits the list to spaces the caller may see; null or omitted means all. */
  async listProjects(limit = 50, offset = 0, projectIds: string[] | null = null): Promise<Project[]> {
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

    return rows.map((row) => mapProject(row));
  }

  async deleteProject(id: string): Promise<void> {
    await db.deleteFrom("projects").where("id", "=", id).execute();
  }

  async findByName(name: string) {
    const row = await db
      .selectFrom("projects")
      .selectAll()
      .where("slug", "=", name)
      .executeTakeFirst();

    if (!row) return null;

    return mapProject(row);
  }

  async archiveProject(id: string): Promise<Project> {
    const result = await db
      .updateTable("projects")
      .set({ archived_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapProject(result);
  }

}
