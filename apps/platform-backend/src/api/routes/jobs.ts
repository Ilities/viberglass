import { Request, Response, Router } from "express";
import { JobService } from "../../services/JobService";
import type { JobStatus } from "../../services/JobService";
import { JobData } from "../../types/Job";
import { tenantMiddleware } from "../middleware/tenantValidation";
import { requireAuth } from "../middleware/authentication";
import {
  validateResultCallback,
  validateProgressUpdate,
  validateLogEntry,
  validateLogBatch,
} from "../middleware/validation";
import { randomUUID } from "crypto";
import logger from "../../config/logger";

const router = Router();
const jobService = new JobService();

router.use(requireAuth);

router.post("/", async (req: Request, res: Response) => {
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

router.get("/:jobId", async (req: Request, res: Response) => {
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

router.get("/", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as JobStatus;
    const limit = parseInt(req.query.limit as string) || 10;
    const projectSlug = req.query.projectSlug as string | undefined;
    const ticketId = req.query.ticketId as string | undefined;

    const result = await jobService.listJobs({ status, limit, projectSlug, ticketId });

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

router.delete("/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const result = await jobService.deleteJob(jobId);

    res.json(result);
  } catch (error) {
    logger.error("Failed to remove job", {
      error: error instanceof Error ? error.message : String(error),
      jobId: req.params.jobId,
    });

    if (error instanceof Error && error.message === "Job not found") {
      return res.status(404).json({ error: "Job not found" });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.get("/stats/queue", async (req: Request, res: Response) => {
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

// POST /:jobId/logs - Worker log lines
router.post(
  "/:jobId/logs",
  tenantMiddleware,
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
