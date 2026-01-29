import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("repository_urls", sql`text[]`, (col) =>
      col.defaultTo(sql`'{}'`),
    )
    .addColumn("agent_instructions", "text")
    .execute();

  await db
    .updateTable("projects")
    .set({
      repository_urls: sql`CASE WHEN repository_url IS NOT NULL THEN ARRAY[repository_url] ELSE '{}'::text[] END`,
    })
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .dropColumn("agent_instructions")
    .dropColumn("repository_urls")
    .execute();
}
