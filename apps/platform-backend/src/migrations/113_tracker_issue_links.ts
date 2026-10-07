import { Kysely, sql } from "kysely";

// A tracker issue is linked to the task it created, as a Slack thread is:
// comments on it reach the task, and milestones are posted back through the
// connection it came from. Comments from people without a Viberglass account
// keep their name and where they wrote. New issues no longer build on their
// own; a connection can have the agent write the plan for them instead.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_issue_links")
    .addColumn("ticket_id", "uuid", (col) => col.primaryKey().references("tickets.id").onDelete("cascade"))
    .addColumn("provider", "varchar(32)", (col) => col.notNull())
    .addColumn("issue_key", "varchar(255)", (col) => col.notNull())
    .addColumn("issue_url", "text")
    .addColumn("integration_id", "uuid", (col) => col.references("integrations.id").onDelete("set null"))
    .addColumn("webhook_config_id", "uuid", (col) => col.references("webhook_provider_configs.id").onDelete("set null"))
    .addColumn("api_base_url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_task_issue_links_issue").on("task_issue_links").columns(["provider", "issue_key"]).execute();

  await sql`
    INSERT INTO task_issue_links (ticket_id, provider, issue_key, issue_url, created_at)
    SELECT id, ticket_system, external_ticket_id, external_ticket_url, created_at
    FROM tickets
    WHERE ticket_system IN ('jira', 'shortcut', 'github') AND external_ticket_id IS NOT NULL
  `.execute(db);

  await db.schema
    .alterTable("task_messages")
    .addColumn("external_author_name", "varchar(255)")
    .addColumn("external_source", "varchar(32)")
    .execute();

  await db.schema.alterTable("webhook_provider_configs").renameColumn("auto_execute", "plan_new_issues").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("webhook_provider_configs").renameColumn("plan_new_issues", "auto_execute").execute();
  await db.schema.alterTable("task_messages").dropColumn("external_author_name").dropColumn("external_source").execute();
  await db.schema.dropTable("task_issue_links").execute();
}
