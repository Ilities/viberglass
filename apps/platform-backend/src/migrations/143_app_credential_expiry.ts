import type { Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/** When a running app's storage credentials expire, so it's restarted with new ones before then. */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").addColumn("credentials_expire_at", "timestamptz").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").dropColumn("credentials_expire_at").execute();
}
