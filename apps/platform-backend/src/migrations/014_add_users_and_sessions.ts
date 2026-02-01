import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("email", "varchar(320)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("password_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("avatar_url", "varchar(1000)")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("user_sessions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("token_hash", "varchar(128)", (col) => col.notNull().unique())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("expires_at", "timestamp", (col) => col.notNull())
    .addColumn("revoked_at", "timestamp")
    .execute();

  await db.schema
    .createIndex("idx_user_sessions_user_id")
    .on("user_sessions")
    .column("user_id")
    .execute();
  await db.schema
    .createIndex("idx_user_sessions_token_hash")
    .on("user_sessions")
    .column("token_hash")
    .execute();
  await db.schema
    .createIndex("idx_user_sessions_expires_at")
    .on("user_sessions")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_sessions").execute();
  await db.schema.dropTable("users").execute();
}
