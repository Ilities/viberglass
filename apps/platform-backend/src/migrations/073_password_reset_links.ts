import { Kysely, sql } from "kysely";

// Reset links an admin can hand out without SMTP. Single use; only the hash is stored.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("password_reset_links")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("used_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("password_reset_links").execute();
}
