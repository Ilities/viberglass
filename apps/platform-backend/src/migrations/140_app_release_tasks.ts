import { type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/** A release built from a change made live knows its task, which hears once how the release ended. */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_releases")
    .addColumn("ticket_id", "uuid", (column) => column.references("tickets.id").onDelete("set null"))
    .addColumn("reported_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_releases").dropColumn("ticket_id").dropColumn("reported_at").execute();
}
