import { Kysely } from "kysely";

// People are deactivated rather than deleted, so their name stays on what they did.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").addColumn("deactivated_at", "timestamptz").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("deactivated_at").execute();
}
