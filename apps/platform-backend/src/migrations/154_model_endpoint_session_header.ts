import { Kysely } from "kysely";

// A header each run sends with a value of its own, for endpoints that refuse requests without a session name.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("model_endpoints").addColumn("session_header", "text").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("model_endpoints").dropColumn("session_header").execute();
}
