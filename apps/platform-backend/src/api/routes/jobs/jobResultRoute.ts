import { Request, Response, Router } from "express";
import logger from "../../../config/logger";
import { AgentPendingRequestDAO } from "../../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../../persistence/agentSession/AgentTurnDAO";
import { RunManifestDAO } from "../../../persistence/job/RunManifestDAO";
import { AgentSessionWorkerEventService } from "../../../services/agentSession/AgentSessionWorkerEventService";
import { SessionTurnContinuationService } from "../../../services/agentSession/SessionTurnContinuationService";
import { isTerminalJobStatus } from "../../../services/job/jobStatus";
import { JobService } from "../../../services/JobService";
import { JobQueryService } from "../../../services/job/JobQueryService";
import { TaskTurnOutcomeService, type RecordedTurn } from "../../../services/taskTurns/TaskTurnOutcomeService";
import { TaskAutoSummariser } from "../../../services/taskTurns/TaskAutoSummariser";
import { TaskTurnService } from "../../../services/taskTurns/TaskTurnService";
import { isObjectRecord } from "@viberglass/types";
import { RUN_MANIFEST_VERSION, type ExecutionManifest } from "@viberglass/telemetry";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";
import { validateResultCallback } from "../../middleware/validation";

const jobService = new JobService();
const jobQueries = new JobQueryService();
const runManifestDAO = new RunManifestDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionDAO = new AgentSessionDAO();
const turnOutcomeService = new TaskTurnOutcomeService({
  turns: agentTurnDAO,
  workerEvents: new AgentSessionWorkerEventService(
    new AgentSessionEventDAO(),
    agentTurnDAO,
    agentSessionDAO,
    new AgentPendingRequestDAO(),
    new SessionTurnContinuationService(agentSessionDAO, agentTurnDAO, new AgentSessionEventDAO()),
  ),
});

const autoSummariser = new TaskAutoSummariser(new TaskTurnService());

function contextUsageOf(value: unknown): { used: number; size: number | null } | undefined {
  if (!isObjectRecord(value) || typeof value.used !== "number") return undefined;
  return { used: value.used, size: typeof value.size === "number" ? value.size : null };
}

/**
 * Stores the worker's execution manifest.
 *
 * Never throws — a manifest is evidence about a run, and losing it must not
 * turn a successful job into a 500 at the callback boundary.
 *
 * Older workers do not send `runManifest`. Rather than skipping those jobs
 * entirely, a minimal manifest is derived from the result the worker does
 * send, with `usageAvailable: false` and `costProvenance: "unavailable"` —
 * honest about what was not reported instead of silently absent.
 */
async function persistExecutionManifest(
  jobId: string,
  tenantId: string,
  job: { jobKind: string; data: { repository: string | null } },
  result: Record<string, unknown>,
): Promise<void> {
  try {
    const reported = result.runManifest as ExecutionManifest | undefined;

    const execution: ExecutionManifest = reported ?? {
      manifestVersion: RUN_MANIFEST_VERSION,
      success: Boolean(result.success),
      usageAvailable: false,
      costProvenance: "unavailable",
      errorMessage:
        typeof result.errorMessage === "string" ? result.errorMessage : undefined,
      branch: typeof result.branch === "string" ? result.branch : undefined,
      commitSha:
        typeof result.commitHash === "string" ? result.commitHash : undefined,
      pullRequestUrl:
        typeof result.pullRequestUrl === "string"
          ? result.pullRequestUrl
          : undefined,
      changedFileCount: Array.isArray(result.changedFiles)
        ? result.changedFiles.length
        : undefined,
      durationMs:
        typeof result.executionTime === "number"
          ? result.executionTime
          : undefined,
      stopReason: result.success ? "completed" : "failed",
      finishedAt: new Date().toISOString(),
    };

    await runManifestDAO.recordExecution(jobId, tenantId, execution, {
      jobKind: job.jobKind,
      // Only used if no dispatch row exists to update; the dispatch half is
      // authoritative when it does.
      repository: job.data.repository ?? "unknown",
    });
  } catch (error) {
    logger.warn("Failed to persist execution manifest", { jobId, error });
  }
}

/** A worker's result for its run: the run manifest, what a task turn produced, then the run's status. */
export function registerJobResultRoute(router: Router): void {
  router.post(
    "/:jobId/result",
    tenantMiddleware,
    validateCallbackToken,
    validateResultCallback,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;
      logger.info("RESULT_CALLBACK_ENTERED", { jobId, url: req.url });

      try {
        const tenantId = req.tenantId!;
        const result = req.body;

        logger.debug("Result callback raw body", {
          jobId,
          bodyKeys: Object.keys(result),
          success: result.success,
          executionTime: result.executionTime,
          executionTimeType: typeof result.executionTime,
        });

        // Verify job belongs to tenant (SEC-03)
        const job = await jobQueries.getJobStatus(jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.data.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Idempotency: Reject updates to terminal states. A cancelled run stays
        // cancelled even if its worker finishes and reports afterwards.
        if (isTerminalJobStatus(job.status)) {
          return res.status(409).json({
            error: "Job already in terminal state",
            status: job.status,
          });
        }

        // Determine status from success field
        const status = result.success ? "completed" : "failed";

        // Execution half of the run manifest. Persisted before the rest of the
        // callback's work so a later failure in document handling or session
        // bookkeeping cannot cost us the record of what the agent actually did.
        await persistExecutionManifest(jobId, tenantId, job, result);

        // Task jobs are session turns; scheduled runs (claws) and webhook builds are not.
        let agentTurn = await agentTurnDAO.getByJobId(jobId);
        if (!agentTurn) {
          const [session] = await agentSessionDAO.listByLastJobId(jobId);
          agentTurn = session?.lastTurnId ? await agentTurnDAO.getById(session.lastTurnId) : null;
        }
        const session = agentTurn ? await agentSessionDAO.getById(agentTurn.sessionId) : null;
        let recordedTurn: RecordedTurn | null = null;
        if (agentTurn && session) {
          recordedTurn = await turnOutcomeService.record(jobId, session, agentTurn, {
            success: Boolean(result.success),
            documents: result.documents,
            codeDiscarded: result.codeDiscarded === true,
            resumed: typeof result.sessionStart?.resumed === "boolean" ? result.sessionStart.resumed : undefined,
            commitHash: typeof result.commitHash === "string" && result.commitHash ? result.commitHash : undefined,
            contextUsage: contextUsageOf(result.contextUsage),
            compacted: result.compacted === true,
          });
        }

        // Update job status using existing JobService method
        await jobService.updateJobStatus(jobId, status, {
          result: {
            success: result.success,
            branch: result.branch,
            pullRequestUrl: result.pullRequestUrl,
            changedFiles: result.changedFiles,
            executionTime: result.executionTime,
            errorMessage: result.errorMessage,
            commitHash: result.commitHash,
          },
          errorMessage: result.errorMessage,
          failureCode:
            typeof result.failureCode === "string" ? result.failureCode : undefined,
          turn: recordedTurn ?? undefined,
        });
        // After the run is finished, so the summary is the session's next turn rather than waiting behind this one.
        if (agentTurn && session && result.success) {
          await autoSummariser.afterTurn(session, agentTurn, contextUsageOf(result.contextUsage));
        }

        return res.json({
          success: true,
          jobId,
          status,
        });
      } catch (error) {
        logger.error("Failed to update job result", {
          error: error instanceof Error ? error.message : String(error),
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );
}
