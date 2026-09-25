import { Kysely, sql } from "kysely";

/**
 * Every row the demo workspace created, so removing the demo deletes exactly
 * those and never real data (ADR 0002).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("demo_seed_records")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("entity_type", "varchar(32)", (col) =>
      col.notNull().check(sql`entity_type IN ('user', 'project', 'clanker', 'job')`),
    )
    .addColumn("entity_id", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("demo_seed_records").execute();
}
