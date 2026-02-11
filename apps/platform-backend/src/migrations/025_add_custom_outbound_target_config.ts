import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("outbound_target_config", "jsonb")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("outbound_target_config")
    .execute();
}
