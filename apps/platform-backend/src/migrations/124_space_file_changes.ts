import { sql, type Kysely } from "kysely";

// A person's upload, edit or deletion made while a run holds a Files space
// waits here, with its content staged in object storage, and is saved as soon
// as the space is free, before the next waiting run starts. A change that
// can't be saved then (the run changed the same file) stays, with its content,
// until the person dismisses it.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("space_file_changes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("kind", "varchar(16)", (col) => col.notNull().check(sql`kind IN ('write', 'remove')`))
    .addColumn("path", "text", (col) => col.notNull())
    // A text save only goes ahead while the file still has the hash it was opened with; null means it must not exist.
    .addColumn("check_base", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("base_sha256", "varchar(64)")
    .addColumn("staged_url", "text")
    .addColumn("bytes", "bigint")
    .addColumn("status", "varchar(16)", (col) => col.notNull().check(sql`status IN ('waiting', 'saved', 'failed')`))
    .addColumn("error", "text")
    .addColumn("snapshot_id", "uuid", (col) => col.references("space_file_snapshots.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .execute();
  await db.schema
    .createIndex("idx_space_file_changes_open")
    .on("space_file_changes")
    .columns(["project_id", "created_at"])
    .where(sql.ref("status"), "in", sql`('waiting', 'failed')`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("space_file_changes").execute();
}
