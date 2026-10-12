import { randomUUID } from "crypto";
import { deriveKeyPrefix, type Project } from "@viberglass/types";
import db from "../config/database";
import type { NewProject } from "./ProjectDAO";
import { mapProject } from "./mapProject";
import { normalizeAgentInstructions, slugify } from "./projectFields";

export async function insertProject(
  request: NewProject,
  maintainerId?: string,
): Promise<Project> {
  const projectId = randomUUID();
  const timestamp = new Date();
  const slug = slugify(request.name);

  const agentInstructions = normalizeAgentInstructions(
    request.agentInstructions,
  );

  const result = await db.transaction().execute(async (trx) => {
    const prefixes = await trx
      .selectFrom("projects")
      .select("key_prefix")
      .execute();
    const keyPrefix = deriveKeyPrefix(
      request.name,
      new Set(prefixes.map((p) => p.key_prefix)),
    );
    const row = await trx
      .insertInto("projects")
      .values({
        id: projectId,
        name: request.name,
        backing_kind: request.backingKind ?? "git",
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

  return mapProject(result);
}
