import {
  ATTR_VG_AGENT_SESSION_ID,
  ATTR_VG_AGENT_TURN_ID,
  ATTR_VG_CHANGED_FILE_COUNT,
  ATTR_VG_JOB_ID,
  ATTR_VG_JOB_KIND,
  ATTR_VG_REPOSITORY,
  ATTR_VG_SESSION_MODE,
  ATTR_VG_STOP_REASON,
  ATTR_VG_TENANT_ID,
  definedAttributes,
  markSpanFailed,
  RUN_MANIFEST_VERSION,
  SpanKind,
  withSpan,
  type ExecutionManifest,
} from "@viberglass/telemetry";
import { JOB_FAILURE_CODE } from "@viberglass/types";
import { JobResult } from "./types";
import { JobFailureError } from "./JobFailureError";
import type { JobRunnerParams, ManifestScratch } from "./jobPipeline";

/**
 * Wraps a job runner function with shared error handling and result callbacks.
 */
export async function withJobLifecycle(
  params: JobRunnerParams,
  jobLabel: string,
  execute: () => Promise<JobResult>,
): Promise<JobResult> {
  // CONSUMER: the receiving end of the backend's `worker.invoke` PRODUCER
  // span. This is the worker's root span, and it is the parent of every
  // clone / agent / commit / PR span for the job.
  return withSpan(
    "job.execute",
    {
      kind: SpanKind.CONSUMER,
      attributes: definedAttributes({
        [ATTR_VG_JOB_ID]: params.data.id,
        [ATTR_VG_JOB_KIND]: params.data.jobKind,
        [ATTR_VG_TENANT_ID]: params.data.tenantId,
        [ATTR_VG_REPOSITORY]: params.data.repository,
        [ATTR_VG_AGENT_SESSION_ID]: params.agentSessionId,
        [ATTR_VG_AGENT_TURN_ID]: params.agentTurnId,
        [ATTR_VG_SESSION_MODE]: params.turnAction,
      }),
    },
    async (span) => {
      // Created here, before the runner starts, so every stage below can
      // record what it learns. `usageAvailable: false` / `unavailable` are
      // the correct defaults: a job that dies before the agent runs reported
      // no usage, and saying so is the point.
      params.manifest = {
        usageAvailable: false,
        costProvenance: "unavailable",
        startedAt: new Date().toISOString(),
      };

      const result = await runJobLifecycle(params, jobLabel, execute);

      span.setAttributes(
        definedAttributes({
          [ATTR_VG_CHANGED_FILE_COUNT]: result.changedFiles.length,
          [ATTR_VG_STOP_REASON]: result.success ? "completed" : "failed",
        }),
      );

      // runJobLifecycle catches everything and reports failure as data — it
      // must, because the platform needs the result callback either way — so
      // the span has to be failed explicitly or every job would look green.
      if (!result.success) {
        markSpanFailed(span, result.errorMessage ?? `${jobLabel} failed`);
      }

      return result;
    },
  );
}

async function runJobLifecycle(
  params: JobRunnerParams,
  jobLabel: string,
  execute: () => Promise<JobResult>,
): Promise<JobResult> {
  const { data, callbackClient, logForwarder, sendProgress, logger } = params;
  const startTime = Date.now();

  try {
    const result = await execute();
    const executionTime = Date.now() - startTime;

    await sendProgress("complete", `${jobLabel} completed successfully`);
    logForwarder.flush();

    const workerResult: JobResult = {
      ...result,
      executionTime,
      runManifest: buildExecutionManifest(params.manifest, {
        success: result.success,
        executionTime,
        branch: result.branch,
        commitSha: result.commitHash,
        pullRequestUrl: result.pullRequestUrl,
        changedFileCount: result.changedFiles.length,
      }),
    };

    try {
      await callbackClient.sendResult(data.id, data.tenantId, {
        ...workerResult,
        logs: [],
      });
    } catch (callbackError) {
      logger.warn(`Failed to send ${jobLabel} result to platform`, {
        jobId: data.id,
        error:
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError),
      });
    }

    return workerResult;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const failureCode =
      error instanceof JobFailureError ? error.code : JOB_FAILURE_CODE.RUN_FAILED;

    await sendProgress("failed", `${jobLabel} failed`, {
      error: errorMessage,
    });
    logger.error(`${jobLabel} failed`, {
      jobId: data.id,
      error: errorMessage,
      failureCode,
      executionTime,
    });
    logForwarder.flush();

    // A failed run is still a run, and a failure is exactly the case the eval
    // corpus needs recorded — so the manifest goes out on this path too.
    const failureManifest = buildExecutionManifest(params.manifest, {
      success: false,
      executionTime,
      errorMessage,
      changedFileCount: 0,
    });

    try {
      await callbackClient.sendResult(data.id, data.tenantId, {
        success: false,
        executionTime,
        errorMessage,
        failureCode,
        logs: [],
        changedFiles: [],
        runManifest: failureManifest,
      });
    } catch (callbackError) {
      logger.warn(`Failed to send ${jobLabel} failure result to platform`, {
        jobId: data.id,
        error:
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError),
      });
    }

    return {
      success: false,
      changedFiles: [],
      executionTime,
      errorMessage,
      runManifest: failureManifest,
    };
  }
}

interface ManifestOutcome {
  success: boolean;
  executionTime: number;
  errorMessage?: string;
  branch?: string;
  commitSha?: string;
  pullRequestUrl?: string;
  changedFileCount?: number;
}

/** Merges the scratch collected during the run with its final outcome. */
function buildExecutionManifest(
  scratch: ManifestScratch | undefined,
  outcome: ManifestOutcome,
): ExecutionManifest {
  const finishedAt = new Date().toISOString();

  return {
    manifestVersion: RUN_MANIFEST_VERSION,
    agent: scratch?.agent,
    harnessVersion: scratch?.harnessVersion,
    modelSnapshot: scratch?.modelSnapshot,
    baseSha: scratch?.baseSha,
    commitSha: outcome.commitSha,
    branch: outcome.branch,
    pullRequestUrl: outcome.pullRequestUrl,
    changedFileCount: outcome.changedFileCount,
    promptHash: scratch?.promptHash,
    promptCharacters: scratch?.promptCharacters,
    usage: scratch?.usage,
    usageAvailable: scratch?.usageAvailable ?? false,
    costUsd: scratch?.costUsd,
    costProvenance: scratch?.costProvenance ?? "unavailable",
    // The agent's own stop reason when it got that far, otherwise the job
    // outcome — a job can fail during clone or PR creation, never reaching
    // the agent at all.
    stopReason:
      scratch?.stopReason ?? (outcome.success ? "completed" : "failed"),
    success: outcome.success,
    errorMessage: outcome.errorMessage,
    startedAt: scratch?.startedAt,
    finishedAt,
    durationMs: outcome.executionTime,
  };
}
