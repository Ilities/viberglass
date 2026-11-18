import { sql, type Kysely } from "kysely";

/** How many Kubernetes workers may run at once; null is no limit. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("workspace_settings")
    .addColumn("worker_max_runs", "integer", (col) => col.check(sql`worker_max_runs > 0`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workspace_settings").dropColumn("worker_max_runs").execute();
}
