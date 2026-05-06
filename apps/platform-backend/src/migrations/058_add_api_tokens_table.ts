import type { Kysely } from "kysely";

export async function up(db: Kysely<Record<string, unknown>>): Promise<void> {
  await db.schema
    .createTable("api_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(db.fn("gen_random_uuid")),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("token_hash", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("token_prefix", "varchar(12)", (col) => col.notNull())
    .addColumn("last_used_at", "timestamp")
    .addColumn("expires_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .execute();

  await db.schema
    .createIndex("idx_api_tokens_token_hash")
    .on("api_tokens")
    .column("token_hash")
    .execute();

  await db.schema
    .createIndex("idx_api_tokens_user_id")
    .on("api_tokens")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<Record<string, unknown>>): Promise<void> {
  await db.schema.dropTable("api_tokens").ifExists().execute();
}
