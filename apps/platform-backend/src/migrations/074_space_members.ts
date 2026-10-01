import { Kysely, sql } from "kysely";

// Space membership (ADR 0005, phase-2-3-handover §2.3). `user_projects` was
// backfilled once and never written since, so it's replaced rather than kept.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_projects").ifExists().execute();

  await db.schema
    .createTable("space_members")
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("role", "varchar(20)", (col) => col.notNull().check(sql`role IN ('maintainer', 'member')`))
    .addColumn("added_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("space_members_pkey", ["project_id", "user_id"])
    .execute();
  await db.schema.createIndex("space_members_user_idx").on("space_members").column("user_id").execute();

  await db.schema
    .alterTable("projects")
    .addColumn("is_private", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  // Guests are invited into specific spaces; they join them on accepting.
  await db.schema
    .alterTable("invites")
    .addColumn("space_ids", sql`uuid[]`, (col) => col.notNull().defaultTo(sql`'{}'::uuid[]`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("invites").dropColumn("space_ids").execute();
  await db.schema.alterTable("projects").dropColumn("is_private").execute();
  await db.schema.dropTable("space_members").execute();
  await db.schema
    .createTable("user_projects")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("role", "varchar(50)", (col) => col.notNull().defaultTo("member"))
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}
