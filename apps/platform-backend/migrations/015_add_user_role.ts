import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("role", "varchar(20)", (col) =>
      col.notNull().defaultTo("member"),
    )
    .execute();

  const firstUser = await db
    .selectFrom("users")
    .select("id")
    .orderBy("created_at", "asc")
    .limit(1)
    .executeTakeFirst();

  if (firstUser) {
    await db
      .updateTable("users")
      .set({ role: "admin" })
      .where("id", "=", firstUser.id)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("role").execute();
}
