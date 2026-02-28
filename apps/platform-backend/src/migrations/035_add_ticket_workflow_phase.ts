import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .addColumn("workflow_phase", "varchar(20)", (col) =>
      col.notNull().defaultTo("research"),
    )
    .execute();

  await sql`
    UPDATE tickets
    SET workflow_phase = 'execution'
  `.execute(db);

  await sql`
    ALTER TABLE tickets
    ADD CONSTRAINT tickets_workflow_phase_check
    CHECK (workflow_phase IN ('research', 'planning', 'execution'))
  `.execute(db);

  await db.schema
    .createIndex("idx_tickets_project_workflow_phase_created")
    .on("tickets")
    .columns(["project_id", "workflow_phase", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("idx_tickets_project_workflow_phase_created")
    .execute();

  await sql`
    ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_workflow_phase_check
  `.execute(db);

  await db.schema.alterTable("tickets").dropColumn("workflow_phase").execute();
}
