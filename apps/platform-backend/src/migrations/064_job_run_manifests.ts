import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Run manifests — one row per job, enough to reproduce or re-grade it.
 *
 * Written in two halves because the halves are known in different processes:
 * the dispatch half at submit time by the backend, the execution half when the
 * worker reports its result. A job whose worker dies still leaves a manifest
 * saying what was dispatched.
 *
 * Deliberately a separate table rather than columns on `jobs`:
 *   - `jobs` rows are mutated throughout a job's life; a manifest is written
 *     once per half and then immutable, which is what makes it trustworthy as
 *     an eval record.
 *   - It is written on a hot callback path, so it must not widen the row that
 *     every status poll and sweeper query reads.
 *   - Retention differs. Manifests are the eval corpus and outlive the
 *     operational job record.
 *
 * `grader_version` is unused in Phase 0 — graders arrive in Phase 1 — but is
 * created now because backfilling a column onto runs already recorded is
 * exactly the retrofit this table exists to avoid.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("job_run_manifests")
    .addColumn("job_id", "text", (col) =>
      col.primaryKey().references("jobs.id").onDelete("cascade"),
    )
    .addColumn("manifest_version", "integer", (col) => col.notNull())
    .addColumn("tenant_id", "text", (col) => col.notNull())

    // --- dispatch half, written by the backend at submit time ---
    .addColumn("job_kind", "text", (col) => col.notNull())
    .addColumn("ticket_id", "text")
    .addColumn("project_id", "text")
    .addColumn("clanker_id", "text")
    .addColumn("requested_agent", "text")
    .addColumn("repository", "text", (col) => col.notNull())
    .addColumn("base_branch", "text")
    .addColumn("worker_type", "text")
    .addColumn("compute_image", "text")
    .addColumn("config_hash", "text")
    .addColumn("instructions_hash", "text")
    // Credential *names* only — never values. See redactSecrets in
    // @viberglass/telemetry for the belt-and-braces pass applied before write.
    .addColumn("granted_credential_names", "jsonb")
    .addColumn("dispatched_at", "timestamptz", (col) => col.notNull())

    // --- execution half, written from the worker's result callback ---
    .addColumn("agent", "text")
    .addColumn("harness_version", "text")
    .addColumn("model_snapshot", "text")
    .addColumn("base_sha", "text")
    .addColumn("commit_sha", "text")
    .addColumn("branch", "text")
    .addColumn("pull_request_url", "text")
    .addColumn("changed_file_count", "integer")
    .addColumn("prompt_hash", "text")
    .addColumn("prompt_characters", "integer")
    .addColumn("tool_permissions", "jsonb")
    .addColumn("usage", "jsonb")
    // False means the CLI reported no usage. Distinct from zero tokens, and
    // distinct from "we did not look". Recording "unavailable" rather than inventing numbers.
    .addColumn("usage_available", "boolean")
    .addColumn("cost_usd", "numeric(12, 6)")
    // 'actual' (reported by the CLI) | 'estimated' (plugin constant) |
    // 'unavailable'. Without this a hardcoded per-plugin constant is
    // indistinguishable from a measurement.
    .addColumn("cost_provenance", "text")
    .addColumn("stop_reason", "text")
    .addColumn("success", "boolean")
    .addColumn("error_message", "text")
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .addColumn("duration_ms", "integer")
    .addColumn("grader_version", "text")

    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE job_run_manifests
    ADD CONSTRAINT job_run_manifests_cost_provenance_check
    CHECK (cost_provenance IS NULL OR cost_provenance IN ('actual', 'estimated', 'unavailable'))
  `.execute(db);

  // Tenant-scoped chronological listing — how the corpus is exported.
  await db.schema
    .createIndex("idx_job_run_manifests_tenant_dispatched")
    .on("job_run_manifests")
    .columns(["tenant_id", "dispatched_at"])
    .execute();

  await sql`
    CREATE INDEX idx_job_run_manifests_pull_request_url
    ON job_run_manifests (pull_request_url)
    WHERE pull_request_url IS NOT NULL
  `.execute(db);

  // "How did agent X do over time" — the core comparison query.
  await sql`
    CREATE INDEX idx_job_run_manifests_agent_dispatched
    ON job_run_manifests (agent, dispatched_at)
    WHERE agent IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("job_run_manifests").execute();
}
