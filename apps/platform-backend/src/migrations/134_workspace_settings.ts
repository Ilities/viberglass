import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable("workspace_settings")
    .addColumn("id", "boolean", (column) => column.primaryKey().defaultTo(true).check(sql`id`))
    .addColumn("app_home_integration_id", "uuid", (column) => column.references("integrations.id").onDelete("set null"))
    .addColumn("app_home_credential_id", "uuid", (column) => column.references("integration_credentials.id").onDelete("set null"))
    .addColumn("app_home_owner", "text")
    .addColumn("updated_by", "uuid", (column) => column.references("users.id").onDelete("set null"))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("workspace_settings").execute();
}
