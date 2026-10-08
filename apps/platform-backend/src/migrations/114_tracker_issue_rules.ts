import { Kysely, sql } from "kysely";

// Spaces choose the tracker issues they take: by label for Jira and Shortcut,
// by their repository (optionally narrowed by label) for GitHub. A connection
// keeps one webhook for its tracker, which no longer points at a space. A
// delivery no space takes is recorded as ignored, with the reason.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("tracker_issue_rules")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("integration_id", "uuid", (col) => col.notNull().references("integrations.id").onDelete("cascade"))
    // Empty takes every GitHub issue in the space's repository.
    .addColumn("label", "varchar(255)")
    .addColumn("plan_new_issues", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    CREATE UNIQUE INDEX uq_tracker_issue_rules_space_label
    ON tracker_issue_rules (project_id, integration_id, lower(coalesce(label, '')))
  `.execute(db);
  await db.schema.createIndex("idx_tracker_issue_rules_integration").on("tracker_issue_rules").column("integration_id").execute();

  // One webhook per connection for the trackers: keep each connection's newest.
  await sql`
    DELETE FROM webhook_provider_configs config
    WHERE config.provider IN ('github', 'jira', 'shortcut')
      AND (config.integration_id IS NULL OR EXISTS (
        SELECT 1 FROM webhook_provider_configs newer
        WHERE newer.integration_id = config.integration_id
          AND newer.provider = config.provider
          AND (newer.created_at, newer.id) > (config.created_at, config.id)
      ))
  `.execute(db);
  await sql`
    UPDATE webhook_provider_configs
    SET project_id = NULL, plan_new_issues = false
    WHERE provider IN ('github', 'jira', 'shortcut')
  `.execute(db);
  await sql`
    UPDATE webhook_provider_configs
    SET allowed_events = allowed_events || '["issues.labeled"]'::jsonb
    WHERE provider = 'github' AND NOT allowed_events @> '["issues.labeled"]'::jsonb
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_webhook_provider_configs_tracker_connection
    ON webhook_provider_configs (integration_id)
    WHERE provider IN ('github', 'jira', 'shortcut')
  `.execute(db);
  await db.schema.alterTable("webhook_provider_configs").dropColumn("provider_project_id").dropColumn("label_mappings").execute();

  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT webhook_delivery_attempts_status_check`.execute(db);
  await sql`
    ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'ignored'))
  `.execute(db);

  await db.schema.dropIndex("idx_task_issue_links_issue").execute();
  await db.schema.createIndex("idx_task_issue_links_issue").on("task_issue_links").columns(["provider", "issue_key", "integration_id"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_task_issue_links_issue").execute();
  await db.schema.createIndex("idx_task_issue_links_issue").on("task_issue_links").columns(["provider", "issue_key"]).execute();

  await sql`UPDATE webhook_delivery_attempts SET status = 'succeeded' WHERE status = 'ignored'`.execute(db);
  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT webhook_delivery_attempts_status_check`.execute(db);
  await sql`
    ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed'))
  `.execute(db);

  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("provider_project_id", "varchar(255)")
    .addColumn("label_mappings", "jsonb", (col) => col.defaultTo(sql`'{}'::jsonb`))
    .execute();
  await sql`DROP INDEX uq_webhook_provider_configs_tracker_connection`.execute(db);
  await db.schema.dropTable("tracker_issue_rules").execute();
}
