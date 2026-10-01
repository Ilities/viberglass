import { Kysely, sql } from "kysely";
import { deriveKeyPrefix } from "@viberglass/types";

// Task keys (phase-2-3-handover §2.4): each space gets a fixed prefix and a
// counter, each task its number and key (WEB-42). Existing tasks are numbered
// in the order they were created.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("key_prefix", "varchar(10)")
    .addColumn("next_task_number", "integer", (col) => col.notNull().defaultTo(1))
    .execute();
  await db.schema
    .alterTable("tickets")
    .addColumn("task_number", "integer")
    .addColumn("task_key", "varchar(24)")
    .execute();

  const projects = await db.selectFrom("projects").select(["id", "name"]).orderBy("created_at", "asc").execute();
  const taken = new Set<string>();
  for (const project of projects) {
    const prefix = deriveKeyPrefix(String(project.name), taken);
    taken.add(prefix);
    await db.updateTable("projects").set({ key_prefix: prefix }).where("id", "=", project.id).execute();
  }

  await sql`
    UPDATE tickets t
    SET task_number = numbered.n, task_key = p.key_prefix || '-' || numbered.n
    FROM (
      SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n FROM tickets
    ) numbered, projects p
    WHERE numbered.id = t.id AND p.id = t.project_id
  `.execute(db);
  await sql`
    UPDATE projects p
    SET next_task_number = COALESCE((SELECT MAX(task_number) FROM tickets WHERE project_id = p.id), 0) + 1
  `.execute(db);

  await sql`ALTER TABLE projects ALTER COLUMN key_prefix SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tickets ALTER COLUMN task_number SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tickets ALTER COLUMN task_key SET NOT NULL`.execute(db);
  await db.schema.createIndex("projects_key_prefix_unique").on("projects").column("key_prefix").unique().execute();
  await db.schema.createIndex("tickets_task_key_unique").on("tickets").column("task_key").unique().execute();
  await db.schema
    .createIndex("tickets_project_number_unique")
    .on("tickets")
    .columns(["project_id", "task_number"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tickets").dropColumn("task_key").dropColumn("task_number").execute();
  await db.schema.alterTable("projects").dropColumn("next_task_number").dropColumn("key_prefix").execute();
}
