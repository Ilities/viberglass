import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Signing in to an app: a single-use code the frontend hands to the app's host,
 * and the gateway session it turns into. Both hang off the person's Viberglass
 * session, so signing out or revoking it ends them too.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable("app_handoff_codes")
    .addColumn("code_hash", "varchar(64)", (column) => column.primaryKey())
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("session_id", "uuid", (column) => column.notNull().references("user_sessions.id").onDelete("cascade"))
    .addColumn("return_path", "text", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("used_at", "timestamptz")
    .execute();

  await db.schema.createTable("app_sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("token_hash", "varchar(64)", (column) => column.notNull().unique())
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("session_id", "uuid", (column) => column.notNull().references("user_sessions.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema.createIndex("app_sessions_expires_at").on("app_sessions").column("expires_at").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("app_sessions").execute();
  await db.schema.dropTable("app_handoff_codes").execute();
}
