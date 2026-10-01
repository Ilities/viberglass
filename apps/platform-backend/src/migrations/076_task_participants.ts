import { Kysely, sql } from "kysely";

// Task participants (phase-2-3-handover §2.4): the requester, the owner, the
// reviewers and the watchers. Tasks made before this have none; their
// creator was never recorded.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_participants")
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("role", "varchar(20)", (col) =>
      col.notNull().check(sql`role IN ('requester', 'owner', 'reviewer', 'watcher')`),
    )
    .addColumn("added_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("task_participants_pkey", ["ticket_id", "user_id", "role"])
    .execute();
  await db.schema.createIndex("task_participants_user_idx").on("task_participants").column("user_id").execute();
  // One owner and one requester per task.
  await sql`CREATE UNIQUE INDEX task_participants_one_owner ON task_participants (ticket_id) WHERE role = 'owner'`.execute(db);
  await sql`CREATE UNIQUE INDEX task_participants_one_requester ON task_participants (ticket_id) WHERE role = 'requester'`.execute(db);

  await db.schema
    .alterTable("projects")
    .addColumn("default_owner_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("projects").dropColumn("default_owner_id").execute();
  await db.schema.dropTable("task_participants").execute();
}
