import { sql, type Kysely } from "kysely";

/**
 * What each person pinned to their Home: an artifact, which always shows its
 * latest version, or an App space's app. The title is kept so a pin to
 * something they can no longer see still says what it was.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_pins")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("artifact_id", "uuid", (column) => column.references("artifacts.id").onDelete("cascade"))
    .addColumn("app_project_id", "uuid", (column) => column.references("projects.id").onDelete("cascade"))
    .addColumn("title", "varchar(200)", (column) => column.notNull())
    .addColumn("position", "integer", (column) => column.notNull())
    .addColumn("last_opened_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("user_pins_one_target", sql`(artifact_id IS NULL) <> (app_project_id IS NULL)`)
    .execute();
  await db.schema.createIndex("user_pins_artifact").unique().on("user_pins").columns(["user_id", "artifact_id"]).where(sql.ref("artifact_id"), "is not", null).execute();
  await db.schema.createIndex("user_pins_app").unique().on("user_pins").columns(["user_id", "app_project_id"]).where(sql.ref("app_project_id"), "is not", null).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_pins").execute();
}
