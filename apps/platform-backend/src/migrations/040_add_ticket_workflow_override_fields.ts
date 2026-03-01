import { Kysely } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .addColumn("workflow_override_reason", "text")
    .addColumn("workflow_overridden_at", "timestamptz")
    .addColumn("workflow_overridden_by", "varchar(255)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .dropColumn("workflow_overridden_by")
    .dropColumn("workflow_overridden_at")
    .dropColumn("workflow_override_reason")
    .execute();
}
