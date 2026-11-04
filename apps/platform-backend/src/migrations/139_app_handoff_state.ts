import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * A handoff code only works in the browser that started signing in: it's
 * bound to a state the gateway keeps in a cookie on the app's host.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`DELETE FROM app_handoff_codes`.execute(db);
  await db.schema.alterTable("app_handoff_codes").addColumn("state_hash", "varchar(64)", (column) => column.notNull()).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_handoff_codes").dropColumn("state_hash").execute();
}
