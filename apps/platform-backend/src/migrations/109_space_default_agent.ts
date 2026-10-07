import { Kysely } from "kysely";

// A space can pick the agent its tasks go to when nobody names one. Deleting
// that agent falls the space back to the workspace's default.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("default_clanker_id", "uuid", (col) => col.references("clankers.id").onDelete("set null"))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("projects").dropColumn("default_clanker_id").execute();
}
