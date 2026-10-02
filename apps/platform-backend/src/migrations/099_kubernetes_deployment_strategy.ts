import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.insertInto("deployment_strategies").values({
    id: sql`gen_random_uuid()`, name: "kubernetes", description: "Run agent workers as Kubernetes Jobs",
    config_schema: JSON.stringify({ type: "object", properties: {
      containerImage: { type: "string" }, namespace: { type: "string" },
      cpu: { type: "string" }, memory: { type: "string" }, ephemeralStorage: { type: "string" },
      activeDeadlineSeconds: { type: "integer", minimum: 1 },
    } }),
    created_at: new Date(),
  }).onConflict((conflict) => conflict.column("name").doNothing()).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("deployment_strategies").where("name", "=", "kubernetes").execute();
}
