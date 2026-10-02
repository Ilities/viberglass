import { Kysely, sql } from "kysely";
import { AGENT_PROVIDER_BINDINGS } from "@viberglass/types";

/**
 * A secret's name becomes a label, so several keys from one provider can coexist.
 * The env var a secret is exposed as moves onto the runner (and task template) that
 * uses it, as `secret_bindings: [{ envVar, secretId }]`. Each existing attachment gets
 * the env var the worker derived from the name until now, so runs behave the same.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'secrets' AND con.contype = 'u'
      LOOP
        EXECUTE format('ALTER TABLE secrets DROP CONSTRAINT %I', constraint_name);
      END LOOP;
    END $$
  `.execute(db);

  await sql`
    ALTER TABLE secrets
      ADD COLUMN source_env_var varchar(255),
      ADD COLUMN provider varchar(50)
  `.execute(db);
  // Until now an env secret's name was the server variable it read.
  await sql`UPDATE secrets SET source_env_var = name WHERE secret_location = 'env'`.execute(db);

  // A key stored under a provider's env var came from that provider, when only one provider uses the name.
  const providersByEnvVar = new Map<string, Set<string>>();
  for (const binding of AGENT_PROVIDER_BINDINGS) {
    const providers = providersByEnvVar.get(binding.envVar) ?? new Set<string>();
    providers.add(binding.provider);
    providersByEnvVar.set(binding.envVar, providers);
  }
  for (const [envVar, providers] of providersByEnvVar) {
    if (providers.size !== 1) continue;
    const [provider] = providers;
    await sql`UPDATE secrets SET provider = ${provider} WHERE name = ${envVar}`.execute(db);
  }

  for (const table of ["clankers", "claw_task_templates"]) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD COLUMN secret_bindings jsonb NOT NULL DEFAULT '[]'::jsonb
    `.execute(db);
    // The worker exposed a secret as its name, uppercased with dashes as underscores.
    await sql`
      UPDATE ${sql.table(table)} t SET secret_bindings = COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'envVar', regexp_replace(upper(replace(s.name, '-', '_')), '[^A-Z0-9_]', '_', 'g'),
          'secretId', s.id::text
        ) ORDER BY ids.ord)
        FROM jsonb_array_elements_text(t.secret_ids) WITH ORDINALITY AS ids(id, ord)
        JOIN secrets s ON s.id::text = ids.id
      ), '[]'::jsonb)
    `.execute(db);
  }

  await sql`DROP INDEX IF EXISTS idx_clankers_secret_ids`.execute(db);
  await sql`ALTER TABLE clankers DROP COLUMN secret_ids`.execute(db);
  await sql`ALTER TABLE claw_task_templates DROP COLUMN secret_ids`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of ["clankers", "claw_task_templates"]) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD COLUMN secret_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    `.execute(db);
    await sql`
      UPDATE ${sql.table(table)} SET secret_ids = COALESCE((
        SELECT jsonb_agg(binding->'secretId') FROM jsonb_array_elements(secret_bindings) AS binding
      ), '[]'::jsonb)
    `.execute(db);
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN secret_bindings`.execute(db);
  }
  await sql`CREATE INDEX idx_clankers_secret_ids ON clankers USING gin (secret_ids)`.execute(db);

  await sql`ALTER TABLE secrets DROP COLUMN provider, DROP COLUMN source_env_var`.execute(db);
  // Fails if labels now repeat; rename the duplicates before migrating down.
  await sql`ALTER TABLE secrets ADD CONSTRAINT secrets_name_key UNIQUE (name)`.execute(db);
}
