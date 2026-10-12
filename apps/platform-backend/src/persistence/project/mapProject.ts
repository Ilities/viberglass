import type { Selectable } from "kysely";
import type { Project } from "@viberglass/types";
import type { Database } from "../types/database";

type ProjectsRow = Selectable<Database["projects"]>;

export function mapProject(row: ProjectsRow): Project {
  return {
    id: row.id,
    backingKind: row.backing_kind,
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
    primaryTicketingIntegrationId:
      row.primary_ticketing_integration_id ?? undefined,
    primaryScmIntegrationId: row.primary_scm_integration_id ?? undefined,
    archivedAt: row.archived_at ? toISOString(row.archived_at) : undefined,
    isPrivate: row.is_private,
    keyPrefix: row.key_prefix,
    defaultOwnerId: row.default_owner_id,
    defaultAgentId: row.default_clanker_id,
    defaultReviewerIds: row.default_reviewer_ids,
    questionReminderHours: row.question_reminder_hours,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

function toISOString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
