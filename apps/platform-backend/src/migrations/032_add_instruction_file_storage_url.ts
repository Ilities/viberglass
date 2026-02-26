import { Kysely } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clanker_config_files")
    .addColumn("storage_url", "text")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("clanker_config_files").dropColumn("storage_url").execute();
}
