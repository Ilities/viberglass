import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add ticket_id column to jobs table
  await db.schema
    .alterTable("jobs")
    .addColumn("ticket_id", "uuid", (col) =>
      col
        .references("tickets.id")
        .onDelete("set null")
        .null(),
    )
    .execute();

  // Add clanker_id column to jobs table
  await db.schema
    .alterTable("jobs")
    .addColumn("clanker_id", "uuid", (col) =>
      col
        .references("clankers.id")
        .onDelete("set null")
        .null(),
    )
    .execute();

  // Create index for ticket_id lookups
  await db.schema
    .createIndex("idx_jobs_ticket_id")
    .on("jobs")
    .column("ticket_id")
    .execute();

  // Create index for clanker_id lookups
  await db.schema
    .createIndex("idx_jobs_clanker_id")
    .on("jobs")
    .column("clanker_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_jobs_clanker_id").execute();
  await db.schema.dropIndex("idx_jobs_ticket_id").execute();
  await db.schema.alterTable("jobs").dropColumn("clanker_id").execute();
  await db.schema.alterTable("jobs").dropColumn("ticket_id").execute();
}
