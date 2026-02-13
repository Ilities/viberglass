import { Kysely, sql } from "kysely";

/**
 * Migration: Add category-specific primary integration columns to projects
 * 
 * This addresses the ambiguity in the current `isPrimary` generic flag by adding
 * explicit columns for primary ticketing and SCM integrations.
 * 
 * Migration Strategy:
 * 1. Add new columns as nullable
 * 2. Backfill from project_integrations.is_primary + integration category
 * 3. Keep project_integrations.is_primary for backward compatibility
 * 4. Future migration will remove is_primary and legacy project fields
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Add primary integration columns to projects table
  await db.schema
    .alterTable("projects")
    .addColumn("primary_ticketing_integration_id", "uuid", (col) =>
      col.references("integrations.id").onDelete("set null")
    )
    .addColumn("primary_scm_integration_id", "uuid", (col) =>
      col.references("integrations.id").onDelete("set null")
    )
    .execute();

  // Create indexes for foreign key lookups
  await db.schema
    .createIndex("idx_projects_primary_ticketing_integration")
    .on("projects")
    .column("primary_ticketing_integration_id")
    .execute();

  await db.schema
    .createIndex("idx_projects_primary_scm_integration")
    .on("projects")
    .column("primary_scm_integration_id")
    .execute();

  // Backfill: Set primary integration IDs based on is_primary flag and integration category
  // This requires joining with integrations table to determine category
  // Note: Using subquery approach for safety across different PostgreSQL versions

  // Backfill primary ticketing integration (non-SCM integrations)
  await sql`
    UPDATE projects p
    SET primary_ticketing_integration_id = (
      SELECT pi.integration_id
      FROM project_integrations pi
      JOIN integrations i ON i.id = pi.integration_id
      WHERE pi.project_id = p.id
        AND pi.is_primary = true
        AND i.system NOT IN ('github', 'gitlab', 'bitbucket')
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM project_integrations pi
      JOIN integrations i ON i.id = pi.integration_id
      WHERE pi.project_id = p.id
        AND pi.is_primary = true
        AND i.system NOT IN ('github', 'gitlab', 'bitbucket')
    )
  `.execute(db);

  // Backfill primary SCM integration (SCM category systems)
  await sql`
    UPDATE projects p
    SET primary_scm_integration_id = (
      SELECT pi.integration_id
      FROM project_integrations pi
      JOIN integrations i ON i.id = pi.integration_id
      WHERE pi.project_id = p.id
        AND pi.is_primary = true
        AND i.system IN ('github', 'gitlab', 'bitbucket')
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM project_integrations pi
      JOIN integrations i ON i.id = pi.integration_id
      WHERE pi.project_id = p.id
        AND pi.is_primary = true
        AND i.system IN ('github', 'gitlab', 'bitbucket')
    )
  `.execute(db);

  // Also populate from project_scm_configs if no primary SCM was found via is_primary
  // This ensures projects with SCM config get their primary_scm_integration_id set
  await sql`
    UPDATE projects p
    SET primary_scm_integration_id = psc.integration_id
    FROM project_scm_configs psc
    WHERE p.id = psc.project_id
      AND p.primary_scm_integration_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_projects_primary_scm_integration")
    .execute();

  await db.schema
    .dropIndex("idx_projects_primary_ticketing_integration")
    .execute();

  await db.schema
    .alterTable("projects")
    .dropColumn("primary_ticketing_integration_id")
    .dropColumn("primary_scm_integration_id")
    .execute();
}
