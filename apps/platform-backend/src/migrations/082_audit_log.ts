import { Kysely, sql } from "kysely";

// The audit log (phase-2-3-handover §2.9): who changed what across the
// workspace, for admins. Append-only; read newest first, by person or area.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("audit_log")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("actor_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("actor_kind", "varchar(20)", (col) => col.notNull().check(sql`actor_kind IN ('human', 'system')`))
    .addColumn("action", "varchar(60)", (col) => col.notNull())
    .addColumn("target_type", "varchar(30)", (col) => col.notNull())
    .addColumn("target_id", "varchar(255)")
    .addColumn("details_json", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("ip", "varchar(64)")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("audit_log_created_idx").on("audit_log").column("created_at").execute();
  await db.schema.createIndex("audit_log_actor_idx").on("audit_log").columns(["actor_id", "created_at"]).execute();
  await db.schema.createIndex("audit_log_target_idx").on("audit_log").columns(["target_type", "created_at"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("audit_log").execute();
}
