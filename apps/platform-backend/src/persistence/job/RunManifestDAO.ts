import type {
  DispatchManifest,
  ExecutionManifest,
} from "@viberglass/telemetry";
import { RUN_MANIFEST_VERSION } from "@viberglass/telemetry";

import db from "../config/database";
import type { Database, Json } from "../types/database";

type ManifestRow = Database["job_run_manifests"];

/**
 * Persists run manifests — the per-job record Phase 0 exists to capture.
 *
 * Two writes per job, from two processes at two times:
 *   - {@link recordDispatch} at submit, so a job whose worker never reports
 *     still leaves evidence of what was dispatched.
 *   - {@link recordExecution} from the result callback.
 *
 * Both are idempotent. The worker retries its result callback, and jobs can be
 * re-dispatched, so a second write must update rather than raise.
 */
export class RunManifestDAO {
  async recordDispatch(manifest: DispatchManifest): Promise<void> {
    const values = {
      job_id: manifest.jobId,
      manifest_version: manifest.manifestVersion ?? RUN_MANIFEST_VERSION,
      tenant_id: manifest.tenantId,
      job_kind: manifest.jobKind,
      ticket_id: manifest.ticketId ?? null,
      project_id: manifest.projectId ?? null,
      clanker_id: manifest.clankerId ?? null,
      requested_agent: manifest.requestedAgent ?? null,
      repository: manifest.repository,
      base_branch: manifest.baseBranch ?? null,
      worker_type: manifest.workerType ?? null,
      compute_image: manifest.computeImage ?? null,
      config_hash: manifest.configHash ?? null,
      instructions_hash: manifest.instructionsHash ?? null,
      granted_credential_names: toJson(manifest.grantedCredentialNames),
      dispatched_at: manifest.dispatchedAt,
    } satisfies Partial<Record<keyof ManifestRow, unknown>> as never;

    await db
      .insertInto("job_run_manifests")
      .values(values)
      .onConflict((oc) =>
        oc.column("job_id").doUpdateSet({
          ...(values as object),
          updated_at: new Date(),
        } as never),
      )
      .execute();
  }

  /**
   * Writes the execution half.
   *
   * Uses an insert-on-conflict-update rather than a plain update because the
   * dispatch row is not guaranteed to exist: manifests were introduced after
   * jobs already existed, and a job dispatched by an older build has no
   * dispatch row to update. Losing the execution record of a real run to a
   * missing parent row would be the worse failure.
   */
  async recordExecution(
    jobId: string,
    tenantId: string,
    execution: ExecutionManifest,
    fallback: { jobKind: string; repository: string },
  ): Promise<void> {
    const executionValues = {
      agent: execution.agent ?? null,
      harness_version: execution.harnessVersion ?? null,
      model_snapshot: execution.modelSnapshot ?? null,
      base_sha: execution.baseSha ?? null,
      commit_sha: execution.commitSha ?? null,
      branch: execution.branch ?? null,
      pull_request_url: execution.pullRequestUrl ?? null,
      changed_file_count: execution.changedFileCount ?? null,
      prompt_hash: execution.promptHash ?? null,
      prompt_characters: execution.promptCharacters ?? null,
      tool_permissions: toJson(execution.toolPermissions),
      usage: toJson(execution.usage),
      usage_available: execution.usageAvailable,
      cost_usd: execution.costUsd ?? null,
      cost_provenance: execution.costProvenance,
      stop_reason: execution.stopReason ?? null,
      success: execution.success,
      error_message: execution.errorMessage ?? null,
      started_at: execution.startedAt ?? null,
      finished_at: execution.finishedAt ?? null,
      duration_ms: execution.durationMs ?? null,
      grader_version: execution.graderVersion ?? null,
      updated_at: new Date(),
    };

    await db
      .insertInto("job_run_manifests")
      .values({
        job_id: jobId,
        manifest_version: execution.manifestVersion ?? RUN_MANIFEST_VERSION,
        tenant_id: tenantId,
        job_kind: fallback.jobKind,
        repository: fallback.repository,
        dispatched_at: new Date(),
        ...executionValues,
      } as never)
      .onConflict((oc) =>
        // Only the execution columns are touched: the dispatch half is the
        // authoritative record of what was sent and must not be overwritten
        // by the placeholder values above.
        oc.column("job_id").doUpdateSet(executionValues as never),
      )
      .execute();
  }

  async getByJobId(jobId: string) {
    return db
      .selectFrom("job_run_manifests")
      .selectAll()
      .where("job_id", "=", jobId)
      .executeTakeFirst();
  }
}

/** Kysely's Json column type takes a serialized string on insert. */
function toJson(value: unknown): Json | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value) as unknown as Json;
}
