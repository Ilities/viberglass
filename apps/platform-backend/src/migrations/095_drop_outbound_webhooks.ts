import { Kysely, sql } from "kysely";

// Results are no longer posted back to the source issue, so outbound webhook
// configs, and the columns only they used, go. Their deliveries keep their
// history with no config.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM webhook_provider_configs WHERE direction = 'outbound'`.execute(db);
  await db.schema.dropIndex("idx_webhook_provider_configs_integration_direction").ifExists().execute();
  await db.schema.dropIndex("idx_webhook_provider_configs_provider_direction_active").ifExists().execute();
  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("direction")
    .dropColumn("api_token_encrypted")
    .dropColumn("outbound_target_config")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("direction", "varchar(20)", (col) =>
      col.notNull().defaultTo("inbound").check(sql`direction IN ('inbound', 'outbound')`),
    )
    .addColumn("api_token_encrypted", "text")
    .addColumn("outbound_target_config", "jsonb")
    .execute();
  await db.schema
    .createIndex("idx_webhook_provider_configs_integration_direction")
    .on("webhook_provider_configs")
    .columns(["integration_id", "direction"])
    .execute();
  await db.schema
    .createIndex("idx_webhook_provider_configs_provider_direction_active")
    .on("webhook_provider_configs")
    .columns(["provider", "direction", "active"])
    .execute();
}
