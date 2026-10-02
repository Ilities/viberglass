import { Kysely } from "kysely";

// Which worker runs a job, kept where later progress doesn't overwrite it, so
// cancelling can stop it: an ECS task by its ARN, as a Docker container is by
// name. And who cancelled a run, which its page shows.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("jobs")
    .addColumn("worker_type", "varchar(20)")
    .addColumn("worker_execution_id", "text")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("jobs").dropColumn("worker_type").dropColumn("worker_execution_id").dropColumn("cancelled_by").execute();
}
