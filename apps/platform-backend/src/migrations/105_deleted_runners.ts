import type { Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clankers")
    .addColumn("deleted_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("clankers").dropColumn("deleted_at").execute();
}
