import { Kysely, sql } from "kysely";

function maxModelLen(servingArgs: unknown): number | undefined {
  if (!Array.isArray(servingArgs)) return undefined;
  for (let index = 0; index < servingArgs.length; index++) {
    const arg = servingArgs[index];
    if (typeof arg !== "string") continue;
    const value = arg === "--max-model-len" ? servingArgs[index + 1] : arg.startsWith("--max-model-len=") ? arg.slice(16) : undefined;
    const tokens = Number(value);
    if (Number.isInteger(tokens) && tokens > 0) return tokens;
  }
  return undefined;
}

// Each model's context length on an endpoint, model ID to tokens. A deployment's comes from its --max-model-len.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("model_endpoints")
    .addColumn("context_windows", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();

  const deployments = await db
    .selectFrom("model_deployments")
    .innerJoin("model_endpoints", "model_endpoints.deployment_id", "model_deployments.id")
    .select(["model_endpoints.id as endpoint_id", "model_deployments.model", "model_deployments.serving_args"])
    .execute();
  for (const deployment of deployments) {
    const tokens = maxModelLen(deployment.serving_args);
    if (!tokens) continue;
    await db
      .updateTable("model_endpoints")
      .set({ context_windows: JSON.stringify({ [deployment.model]: tokens }) })
      .where("id", "=", deployment.endpoint_id)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("model_endpoints").dropColumn("context_windows").execute();
}
