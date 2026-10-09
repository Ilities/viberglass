import { Kysely, sql } from "kysely";

// A person's account on each chat service they linked, by the service's adapter name.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_chat_identities")
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("adapter_name", "varchar(64)", (col) => col.notNull())
    .addColumn("chat_user_id", "varchar(128)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("pk_user_chat_identities", ["user_id", "adapter_name"])
    .addUniqueConstraint("uq_user_chat_identities_account", ["adapter_name", "chat_user_id"])
    .execute();

  await sql`
    INSERT INTO user_chat_identities (user_id, adapter_name, chat_user_id)
    SELECT id, 'slack', slack_user_id FROM users WHERE slack_user_id IS NOT NULL
  `.execute(db);

  await db.schema.alterTable("users").dropColumn("slack_user_id").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").addColumn("slack_user_id", "varchar(32)").execute();
  await sql`
    UPDATE users SET slack_user_id = identities.chat_user_id
    FROM user_chat_identities identities
    WHERE identities.user_id = users.id AND identities.adapter_name = 'slack'
  `.execute(db);
  await db.schema.dropTable("user_chat_identities").execute();
}
