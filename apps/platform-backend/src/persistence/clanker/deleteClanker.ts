import { sql, type Kysely } from "kysely";
import type { Database } from "../types/database";

export async function deleteClanker(
  db: Kysely<Database>,
  id: string,
): Promise<void> {
  const timestamp = new Date();
  // Sessions and turns retain the runner's identity; the slug is freed for a replacement.
  await db
    .updateTable("clankers")
    .set({
      deleted_at: timestamp,
      updated_at: timestamp,
      status: "inactive",
      slug: sql<string>`'deleted-' || id::text`,
    })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .execute();
}
