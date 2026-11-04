import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * An app's access list: people beyond the space's members who may open it.
 * Invites can name apps too, and accepting one puts the new person on their lists.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable("app_access")
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("added_by", "uuid", (column) => column.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("app_access_pkey", ["project_id", "user_id"])
    .execute();
  await db.schema.createIndex("app_access_user_id").on("app_access").column("user_id").execute();

  await db.schema.alterTable("invites")
    .addColumn("app_ids", sql`uuid[]`, (column) => column.notNull().defaultTo(sql`'{}'::uuid[]`))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("invites").dropColumn("app_ids").execute();
  await db.schema.dropTable("app_access").execute();
}
