import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("secrets")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("secret_location", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("env")
        .check(sql`secret_location IN ('env', 'database', 'ssm')`),
    )
    .addColumn("secret_path", "varchar(500)")
    .addColumn("secret_value_encrypted", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("idx_secrets_location")
    .on("secrets")
    .column("secret_location")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_secrets_location").execute();
  await db.schema.dropTable("secrets").execute();
}
