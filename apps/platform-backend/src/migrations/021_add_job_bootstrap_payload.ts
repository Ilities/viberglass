import { Kysely } from "kysely";

/**
 * Migration: Add bootstrap_payload column to jobs table
 *
 * Stores a worker bootstrap payload snapshot so workers can fetch
 * configuration via short job references instead of huge CLI arguments.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("jobs")
    .addColumn("bootstrap_payload", "jsonb")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("jobs").dropColumn("bootstrap_payload").execute();
}
