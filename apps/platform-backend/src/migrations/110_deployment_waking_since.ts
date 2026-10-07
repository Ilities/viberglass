import { Kysely } from "kysely";

// When a deployment was first seen waking. A replica that crashes on start
// looks like one that's booting, so only the time spent waking tells them apart.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("model_deployments").addColumn("waking_since", "timestamptz").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("model_deployments").dropColumn("waking_since").execute();
}
