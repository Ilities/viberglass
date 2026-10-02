import { Kysely } from "kysely";

// Admins are warned once before a connection's credential expires, so runs
// don't stop on it; replacing the expiry date warns again for the new one.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("integration_credentials").addColumn("expiry_warned_at", "timestamptz").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("integration_credentials").dropColumn("expiry_warned_at").execute();
}
