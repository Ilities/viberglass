import { Request, Response, Router } from "express";
import { JobService } from "../../services/JobService";
import { JobData, JobStatus } from "../../types/Job";
import { tenantMiddleware } from "../middleware/tenantValidation";
import { validateCallbackToken } from "../middleware/callbackTokenValidation";
import { requireAuth } from "../middleware/authentication";
import {
  validateResultCallback,
  validateProgressUpdate,
  validateCodexAuthCache,
  validateLogEntry,
  validateLogBatch,
} from "../middleware/validation";
import { randomUUID } from "crypto";
import logger from "../../config/logger";
import { SecretService } from "../../services/SecretService";
import { TicketPhaseDocumentService } from "../../services/TicketPhaseDocumentService";
import { JOB_KIND, TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import {
  isJobServiceError,
  JOB_SERVICE_ERROR_CODE,
} from "../../services/errors/JobServiceError";
import { isSecretServiceError } from "../../services/errors/SecretServiceError";

const router = Router();
const jobService = new JobService();
const secretService = new SecretService();
const ticketPhaseDocumentService = new TicketPhaseDocumentService();

function getDocumentPhaseForJobKind(jobKind: string): "research" | "planning" | null {
  if (jobKind === JOB_KIND.RESEARCH) {
    return TICKET_WORKFLOW_PHASE.RESEARCH;
  }
  if (jobKind === JOB_KIND.PLANNING) {
    return TICKET_WORKFLOW_PHASE.PLANNING;
  }

  return null;
}

router.post("/", requireAuth, async (req: Request, res: Response) => {
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
    const job = await jobService.getJobStatus(jobId);

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

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as JobStatus;
    const limit = parseInt(req.query.limit as string) || 10;
    const projectSlug = req.query.projectSlug as string | undefined;
    const ticketId = req.query.ticketId as string | undefined;

    const result = await jobService.listJobs({
      status,
      limit,
      projectSlug,
      ticketId,
    });

    res.json(result);
  } catch (error) {
    logger.error("Failed to list jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.get(
  "/:jobId/bootstrap",
  tenantMiddleware,
  validateCallbackToken,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;

      const bootstrap = await jobService.getBootstrapPayload(jobId);
      if (!bootstrap) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (bootstrap.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!bootstrap.payload) {
        return res.status(404).json({
          error: "Bootstrap payload not found",
          message: "No bootstrap payload was stored for this job",
        });
      }

      return res.json({
        success: true,
        data: bootstrap.payload,
      });
    } catch (error) {
      logger.error("Failed to fetch job bootstrap payload", {
        error: error instanceof Error ? error.message : String(error),
        jobId: req.params.jobId,
      });
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

router.delete("/:jobId", requireAuth, async (req: Request, res: Response) => {
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

router.get("/stats/queue", requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await jobService.getQueueStats();

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

router.post(
  "/:jobId/result",
  tenantMiddleware,
  validateCallbackToken,
  validateResultCallback,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const result = req.body;

      // Verify job belongs to tenant (SEC-03)
      const job = await jobService.getJobStatus(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.data.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Idempotency: Reject updates to terminal states
      if (job.status === "completed" || job.status === "failed") {
        return res.status(409).json({
          error: "Job already in terminal state",
          status: job.status,
        });
      }

      // Determine status from success field
      const status = result.success ? "completed" : "failed";
      const documentPhase = getDocumentPhaseForJobKind(job.jobKind);

      if (
        documentPhase &&
        result.success &&
        job.ticketId &&
        typeof result.documentContent === "string"
      ) {
        await ticketPhaseDocumentService.saveDocument(
          job.ticketId,
          documentPhase,
          result.documentContent,
          { source: "agent" },
        );
      } else if (
        documentPhase &&
        result.success &&
        !result.documentContent
      ) {
        return res.status(400).json({
          error: `${job.jobKind} result missing document content`,
        });
      }

      // Update job status using existing JobService method
      await jobService.updateJobStatus(jobId, status, {
        result: {
          success: result.success,
          branch: result.branch,
          pullRequestUrl: result.pullRequestUrl,
          documentContent: result.documentContent,
          changedFiles: result.changedFiles,
          executionTime: result.executionTime,
          errorMessage: result.errorMessage,
          commitHash: result.commitHash,
        },
        errorMessage: result.errorMessage,
      });

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

// POST /:jobId/progress - Worker progress update (also updates heartbeat)
router.post(
  "/:jobId/progress",
  tenantMiddleware,
  validateCallbackToken,
  validateProgressUpdate,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const { step, message, details } = req.body;

      const job = await jobService.getJobStatus(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.data.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Record progress (updates heartbeat)
      await jobService.recordProgress(jobId, { step, message, details });

      return res.json({
        success: true,
        jobId,
      });
    } catch (error) {
      logger.error("Failed to record job progress", {
        error: error instanceof Error ? error.message : String(error),
        jobId: req.params.jobId,
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

// POST /:jobId/codex-auth-cache - Worker uploads Codex auth cache
router.post(
  "/:jobId/codex-auth-cache",
  tenantMiddleware,
  validateCallbackToken,
  validateCodexAuthCache,
  async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const tenantId = req.tenantId!;
    const secretName =
      typeof req.body.secretName === "string" ? req.body.secretName : "";
    const authJson =
      typeof req.body.authJson === "string" ? req.body.authJson : "";
    const updatedAt =
      typeof req.body.updatedAt === "string" ? req.body.updatedAt : null;

    try {
      logger.info("Received Codex auth cache callback", {
        jobId,
        tenantId,
        secretName,
        authJsonLength: authJson.length,
        hasUpdatedAt: Boolean(updatedAt),
        callbackTokenValidated: Boolean(req.callbackTokenValidated),
      });

      const job = await jobService.getJobStatus(jobId);
      if (!job) {
        logger.warn("Codex auth cache callback rejected: job not found", {
          jobId,
          tenantId,
          secretName,
        });
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.data.tenantId !== tenantId) {
        logger.warn("Codex auth cache callback rejected: tenant mismatch", {
          jobId,
          tenantId,
          expectedTenantId: job.data.tenantId,
          secretName,
        });
        return res.status(403).json({ error: "Access denied" });
      }

      logger.info("Persisting Codex auth cache", {
        jobId,
        tenantId,
        secretName,
      });
      const metadata = await secretService.upsertWorkerAuthCache(
        secretName,
        authJson,
      );

      logger.info("Persisted Codex auth cache", {
        jobId,
        tenantId,
        secretName,
        secretId: metadata.id,
        secretLocation: metadata.secretLocation,
      });

      return res.json({
        success: true,
        secretId: metadata.id,
        secretLocation: metadata.secretLocation,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      const statusCode = isSecretServiceError(error) ? error.statusCode : 500;

      logger.error("Failed to persist Codex auth cache", {
        error: error instanceof Error ? error.message : String(error),
        statusCode,
        jobId,
        tenantId,
        secretName,
        authJsonLength: authJson.length,
      });
      return res.status(statusCode).json({
        error: errorMessage,
      });
    }
  },
);

// POST /:jobId/logs - Worker log lines
router.post(
  "/:jobId/logs",
  tenantMiddleware,
  validateCallbackToken,
  validateLogEntry,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const { level, message, source } = req.body;

      const job = await jobService.getJobStatus(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.data.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Record log line
      await jobService.recordLog(jobId, { level, message, source });

      return res.json({
        success: true,
      });
    } catch (error) {
      logger.error("Failed to record job log", {
        error: error instanceof Error ? error.message : error,
        jobId: req.params.jobId,
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

// POST /:jobId/logs/batch - Batch worker log lines
router.post(
  "/:jobId/logs/batch",
  tenantMiddleware,
  validateCallbackToken,
  validateLogBatch,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const { logs } = req.body;
      const job = await jobService.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.data.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Record batch of log lines with single bulk insert
      await jobService.recordLogBatch(jobId, logs);

      return res.json({
        success: true,
        count: logs.length,
      });
    } catch (error) {
      logger.error("Failed to record job log batch", {
        error: error instanceof Error ? error.message : error,
        jobId: req.params.jobId,
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

export default router;
