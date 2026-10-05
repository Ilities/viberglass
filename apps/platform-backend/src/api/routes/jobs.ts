import { NextFunction, Request, Response, Router } from "express";
import { JobService } from "../../services/JobService";
import { JobQueryService } from "../../services/job/JobQueryService";
import { JobData, JobStatus } from "../../types/Job";
import { requireAuth } from "../middleware/authentication";
import { requireRunnerRole } from "../middleware/workspaceRoleGuards";
import { randomUUID } from "crypto";
import logger from "../../config/logger";
import { JOB_KIND } from "@viberglass/types";
import {
  isJobServiceError,
  JOB_SERVICE_ERROR_CODE,
} from "../../services/errors/JobServiceError";
import { JobCancellationService } from "../../services/job/JobCancellationService";
import { jobParamGuard, spaceViewerOf } from "../middleware/spaceAccessGuards";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { isDomainError } from "../../services/errors/DomainError";
import { registerCodexAuthCacheRoute } from "./jobs/codexAuthCacheRoute";
import { registerJobResultRoute } from "./jobs/jobResultRoute";
import { registerJobWorkerCallbackRoutes } from "./jobs/workerCallbackRoutes";
import { registerQuestionCallbackRoute } from "./jobs/questionCallbackRoute";
import { registerPartialResultRoute } from "./jobs/partialResultRoute";
import { registerSkillCallbackRoute } from "./jobs/skillCallbackRoute";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { RunRecordDAO } from "../../persistence/job/RunRecordDAO";
import { RunRecordService } from "../../services/runRecords/RunRecordService";

const router = Router();
// Worker callbacks carry no user and pass through; people only reach runs in spaces they see.
const spaceAccess = new SpaceAccessService();
router.param("jobId", jobParamGuard(spaceAccess));
const jobService = new JobService();
const jobQueries = new JobQueryService();
const jobCancellationService = new JobCancellationService();
const sessionEvents = new AgentSessionEventDAO();
const runRecords = new RunRecordService(new RunRecordDAO());

router.post("/", requireRunnerRole, async (req: Request, res: Response) => {
  try {
    const {
      repository,
      task,
      branch,
      baseBranch,
      context,
      settings,
      tenantId,
    } = req.body;

    if (!repository || !task) {
      return res.status(400).json({
        error: "Missing required fields: repository and task are required",
      });
    }

    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const jobData: JobData = {
      jobKind: JOB_KIND.EXECUTION,
      tenantId: tenantId ?? "api-server",
      id: jobId,
      repository,
      task,
      branch: branch || "main",
      baseBranch: baseBranch || "main",
      context: context || {},
      settings: settings || {},
      timestamp: Date.now(),
    };

    const result = await jobService.submitJob(jobData);

    res.status(202).json(result);
  } catch (error) {
    logger.error("Failed to enqueue job", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.get("/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await jobQueries.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(job);
  } catch (error) {
    logger.error("Failed to get job status", {
      error: error instanceof Error ? error.message : String(error),
      jobId: req.params.jobId,
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// What the agent thought, said and ran in the run; a run that's still going is followed with `afterSequence`.
router.get("/:jobId/events", requireAuth, async (req: Request, res: Response) => {
  try {
    const afterSequence = Number(req.query.afterSequence ?? 0);
    const events = await sessionEvents.listByJob(req.params.jobId, Number.isFinite(afterSequence) ? afterSequence : 0);
    res.json({ success: true, data: events });
  } catch (error) {
    logger.error("Failed to list run events", {
      error: error instanceof Error ? error.message : String(error),
      jobId: req.params.jobId,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// The run's record: model, tokens, cost, outcome. Anyone who can see the run can see what it used.
router.get("/:jobId/record", requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await runRecords.get(req.params.jobId);
    if (!record) return res.status(404).json({ error: "No record for this run" });
    return res.json(record);
  } catch (error) {
    logger.error("Failed to get run record", {
      error: error instanceof Error ? error.message : String(error),
      jobId: req.params.jobId,
    });
    return res.status(500).json({ error: "Failed to get run record" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as JobStatus;
    const limit = parseInt(req.query.limit as string) || 10;
    const projectSlug = req.query.projectSlug as string | undefined;
    const ticketId = req.query.ticketId as string | undefined;
    const scope = await spaceAccess.scopeFor(spaceViewerOf(req)!, projectSlug);

    const result = await jobQueries.listJobs({
      status,
      limit,
      projectSlug,
      ticketId,
      projectIds: scope.projectIds,
    });

    res.json(result);
  } catch (error) {
    if (isDomainError(error)) return next(error);
    logger.error("Failed to list jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.delete("/:jobId", requireRunnerRole, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const result = await jobService.deleteJob(jobId);

    res.json(result);
  } catch (error) {
    logger.error("Failed to remove job", {
      error: error instanceof Error ? error.message : String(error),
      jobId: req.params.jobId,
    });

    if (
      isJobServiceError(error) &&
      error.code === JOB_SERVICE_ERROR_CODE.JOB_NOT_FOUND
    ) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.post("/:jobId/cancel", requireRunnerRole, async (req: Request, res: Response) => {
  const { jobId } = req.params;
  try {
    const result = await jobCancellationService.cancel(jobId, req.authContext?.user.id);
    switch (result) {
      case "not_found":
        return res.status(404).json({ error: "Run not found" });
      case "terminal":
        return res.status(409).json({ error: "Run has already finished" });
      default:
        return res.json({ jobId, status: "cancelled" });
    }
  } catch (error) {
    logger.error("Failed to cancel job", {
      error: error instanceof Error ? error.message : String(error),
      jobId,
    });
    return res.status(500).json({ error: "Failed to cancel run" });
  }
});

router.get("/stats/queue", requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await jobQueries.getQueueStats();

    res.json(stats);
  } catch (error) {
    logger.error("Failed to get queue stats", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

registerJobWorkerCallbackRoutes(router);
registerJobResultRoute(router);
registerCodexAuthCacheRoute(router);
registerQuestionCallbackRoute(router);
registerPartialResultRoute(router);
registerSkillCallbackRoute(router);


export default router;
