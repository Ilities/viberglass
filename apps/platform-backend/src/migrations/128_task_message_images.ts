import { Kysely } from "kysely";

// Images attached to a message in a task's thread, in the order they were attached.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_message_images")
    .addColumn("message_id", "uuid", (col) => col.notNull().references("task_messages.id").onDelete("cascade"))
    .addColumn("media_id", "uuid", (col) => col.notNull().references("media_assets.id").onDelete("cascade"))
    .addColumn("position", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("task_message_images_pkey", ["message_id", "media_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("task_message_images").execute();
}
