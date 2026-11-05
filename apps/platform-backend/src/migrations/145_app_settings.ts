import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Values an App space's maintainers set for its app: plain ones here, secret
 * ones in `secrets`. A change restarts the running app, and each release
 * records which settings its manifest declares.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("app_settings")
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("name", "varchar(100)", (column) => column.notNull())
    .addColumn("value", "text")
    .addColumn("secret_id", "uuid", (column) => column.references("secrets.id").onDelete("cascade"))
    .addColumn("for_previews", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("updated_by", "uuid", (column) => column.references("users.id").onDelete("set null"))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("app_settings_pkey", ["project_id", "name"])
    .addCheckConstraint("app_settings_value_or_secret", sql`(value IS NULL) <> (secret_id IS NULL)`)
    .execute();
  await db.schema.alterTable("apps").addColumn("restart_due", "boolean", (column) => column.notNull().defaultTo(false)).execute();
  await db.schema.alterTable("app_releases").addColumn("settings", "jsonb").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_releases").dropColumn("settings").execute();
  await db.schema.alterTable("apps").dropColumn("restart_due").execute();
  await db.schema.dropTable("app_settings").execute();
}
