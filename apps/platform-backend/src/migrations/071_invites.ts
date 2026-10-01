import { Kysely, sql } from "kysely";

// Invite links (ADR 0005, phase-2-3-handover §2.2). Only a hash of the token
// is stored; the link is shown once, when the invite is made.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("invites")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("role", "varchar(20)", (col) => col.notNull())
    .addColumn("token_hash", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("accepted_at", "timestamptz")
    .addColumn("accepted_user_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("revoked_at", "timestamptz")
    .execute();

  await db.schema.createIndex("invites_email_idx").on("invites").column("email").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("invites").execute();
}
