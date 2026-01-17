import express, { Request, Response } from "express";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { createLogger, format, transports } from "winston";
import { ConfigManager } from "./config/ConfigManager";
import { Configuration } from "./types";
import { CodingJobData } from "./workers/types";

class ApiServer {
  private app: express.Application;
  private queue: Queue<CodingJobData>;
  private logger: any;
  private config!: Configuration;

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: "10mb" }));

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      format:
        process.env.LOG_FORMAT === "text" ? format.simple() : format.json(),
      transports: [
        new transports.Console(),
        new transports.File({ filename: "api-server.log" }),
      ],
    });

    // Initialize Redis connection
    const redisConnection = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: null,
    });

    // Initialize job queue
    this.queue = new Queue<CodingJobData>("coding-agent-jobs", {
      connection: redisConnection,
    });

    this.setupRoutes();
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing API Server...");

      // Load configuration
      const configManager = new ConfigManager(this.logger);
      this.config = await configManager.loadConfiguration();

      // Update logger level
      this.logger.level = this.config.logging.level;

      this.logger.info("API Server initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize API Server", { error });
      throw error;
    }
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        status: "healthy",
        service: "api-server",
        timestamp: new Date().toISOString(),
      });
    });

    // Submit a coding job
    this.app.post("/jobs", async (req: Request, res: Response) => {
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

        // Validate required fields
        if (!repository || !task) {
          return res.status(400).json({
            error: "Missing required fields: repository and task are required",
          });
        }

        // Generate job ID
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create job data
        const jobData: CodingJobData = {
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

        // Enqueue the job
        const job = await this.queue.add("execute-coding-task", jobData, {
          jobId,
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 200, // Keep last 200 failed jobs
          attempts: 1, // No retries for now
        });

        this.logger.info("Job enqueued", { jobId, repository });

        res.status(202).json({
          jobId: job.id,
          status: "queued",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to enqueue job", { error });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // Get job status
    this.app.get("/jobs/:jobId", async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const job = await this.queue.getJob(jobId);

        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }

        const state = await job.getState();
        const progress = job.progress;
        const result = job.returnvalue;
        const failedReason = job.failedReason;

        res.json({
          jobId: job.id,
          status: state,
          progress,
          data: job.data,
          result,
          failedReason,
          createdAt: job.timestamp,
          processedAt: job.processedOn,
          finishedAt: job.finishedOn,
        });
      } catch (error) {
        this.logger.error("Failed to get job status", {
          error,
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // List jobs
    this.app.get("/jobs", async (req: Request, res: Response) => {
      try {
        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 10;

        let jobs;
        if (status) {
          jobs = await this.queue.getJobs([status as any], 0, limit - 1);
        } else {
          const [waiting, active, completed, failed] = await Promise.all([
            this.queue.getWaiting(0, Math.floor(limit / 4)),
            this.queue.getActive(0, Math.floor(limit / 4)),
            this.queue.getCompleted(0, Math.floor(limit / 4)),
            this.queue.getFailed(0, Math.floor(limit / 4)),
          ]);
          jobs = [...waiting, ...active, ...completed, ...failed];
        }

        const jobsData = await Promise.all(
          jobs.map(async (job) => ({
            jobId: job.id,
            status: await job.getState(),
            repository: job.data.repository,
            task: job.data.task,
            createdAt: job.timestamp,
            processedAt: job.processedOn,
            finishedAt: job.finishedOn,
          })),
        );

        res.json({ jobs: jobsData, count: jobsData.length });
      } catch (error) {
        this.logger.error("Failed to list jobs", { error });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // Delete a job
    this.app.delete("/jobs/:jobId", async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const job = await this.queue.getJob(jobId);

        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }

        await job.remove();
        this.logger.info("Job removed", { jobId });

        res.json({ message: "Job removed successfully", jobId });
      } catch (error) {
        this.logger.error("Failed to remove job", {
          error,
          jobId: req.params.jobId,
        });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // Queue statistics
    this.app.get("/stats", async (req: Request, res: Response) => {
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          this.queue.getWaitingCount(),
          this.queue.getActiveCount(),
          this.queue.getCompletedCount(),
          this.queue.getFailedCount(),
        ]);

        res.json({
          queue: "coding-agent-jobs",
          waiting,
          active,
          completed,
          failed,
          total: waiting + active + completed + failed,
        });
      } catch (error) {
        this.logger.error("Failed to get queue stats", { error });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });
  }

  async start(): Promise<void> {
    const port = process.env.API_PORT || 3000;

    this.app.listen(port, () => {
      this.logger.info(`API Server listening on port ${port}`);
    });
  }
}

// Main execution
async function main(): Promise<void> {
  const server = new ApiServer();

  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error("Failed to start API Server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

main().catch(console.error);

export { ApiServer };
