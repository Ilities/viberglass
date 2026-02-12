import { Kysely, sql } from "kysely";

/**
 * Migration: Add callback_token column to jobs table
 *
 * This adds a cryptographically random token that workers must present
 * when sending callbacks (result, progress, logs) to the platform.
 * This prevents unauthorized entities from spoofing job callbacks.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Add callback_token column - stores the secret token for callback authentication
  await db.schema
    .alterTable("jobs")
    .addColumn("callback_token", "varchar(64)", (col) => col.notNull().defaultTo(""))
    .execute();

  // Create index for token lookups during callback validation
  await db.schema
    .createIndex("idx_jobs_callback_token")
    .on("jobs")
    .column("callback_token")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_jobs_callback_token").execute();
  await db.schema.alterTable("jobs").dropColumn("callback_token").execute();
}
