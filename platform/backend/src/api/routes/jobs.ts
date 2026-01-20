import { Request, Response, Router } from "express";
import { JobService } from "../../services/JobService";
import { JobData } from "../../types/Job";
import { tenantMiddleware } from "../middleware/tenantValidation";
import { validateResultCallback } from "../middleware/validation";
import { randomUUID } from "crypto";

const router = Router();
const jobService = new JobService();

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
    console.error("Failed to enqueue job", { error });
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
    console.error("Failed to get job status", {
      error,
      jobId: req.params.jobId,
    });
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await jobService.listJobs(status, limit);

    res.json(result);
  } catch (error) {
    console.error("Failed to list jobs", { error });
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
    console.error("Failed to remove job", {
      error,
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
    console.error("Failed to get queue stats", { error });
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
      console.error("Failed to update job result", {
        error,
        jobId: req.params.jobId,
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

export default router;
