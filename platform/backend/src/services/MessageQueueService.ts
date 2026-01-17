import Bull from "bull";
import * as Redis from "redis";
import { TicketSystem } from "../models/BugReport";
import { Ticket } from "../models/PMIntegration";

interface AutoFixJobData {
  ticketId: string;
  ticketSystem: TicketSystem;
  repositoryUrl: string;
  issueData?: Ticket;
  priority: string;
}

interface BugReportProcessingJobData {
  bugReportId: string;
  ticketSystem: TicketSystem;
  autoCreateTicket: boolean;
}

export class MessageQueueService {
  private redisClient: Redis.RedisClientType;
  private autoFixQueue: Bull.Queue<AutoFixJobData>;
  private bugReportQueue: Bull.Queue<BugReportProcessingJobData>;

  constructor() {
    // Initialize Redis client
    this.redisClient = Redis.createClient({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD || undefined,
    });

    // Initialize Bull queues
    this.autoFixQueue = new Bull<AutoFixJobData>("auto-fix-queue", {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });

    this.bugReportQueue = new Bull<BugReportProcessingJobData>(
      "bug-report-queue",
      {
        redis: {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379"),
          password: process.env.REDIS_PASSWORD || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      },
    );

    this.setupJobProcessors();
  }

  private setupJobProcessors() {
    // Auto-fix job processor
    this.autoFixQueue.process("process-auto-fix", async (job) => {
      const { ticketId, ticketSystem, repositoryUrl, issueData, priority } =
        job.data;

      console.log(
        `[DEBUG_LOG] Processing auto-fix job for ticket ${ticketId} in ${ticketSystem}`,
      );

      try {
        // Update job progress
        await job.progress(10);

        // Here would be the actual auto-fix logic
        // This is a placeholder for the AI agent processing
        await this.processAutoFix(
          ticketId,
          ticketSystem,
          repositoryUrl,
          issueData,
        );

        await job.progress(50);

        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await job.progress(100);

        console.log(
          `[DEBUG_LOG] Auto-fix job completed for ticket ${ticketId}`,
        );

        return {
          success: true,
          ticketId,
          message: "Auto-fix processing completed",
        };
      } catch (error) {
        console.error(
          `[DEBUG_LOG] Auto-fix job failed for ticket ${ticketId}:`,
          error,
        );
        throw error;
      }
    });

    // Bug report processing job processor
    this.bugReportQueue.process("process-bug-report", async (job) => {
      const { bugReportId, ticketSystem, autoCreateTicket } = job.data;

      console.log(
        `[DEBUG_LOG] Processing bug report ${bugReportId} for ${ticketSystem}`,
      );

      try {
        await job.progress(20);

        if (autoCreateTicket) {
          await this.createTicketFromBugReport(bugReportId, ticketSystem);
        }

        await job.progress(100);

        return {
          success: true,
          bugReportId,
          ticketCreated: autoCreateTicket,
        };
      } catch (error) {
        console.error(
          `[DEBUG_LOG] Bug report processing failed for ${bugReportId}:`,
          error,
        );
        throw error;
      }
    });

    // Setup event listeners for monitoring
    this.autoFixQueue.on("completed", (job, result) => {
      console.log(`Auto-fix job ${job.id} completed:`, result);
    });

    this.autoFixQueue.on("failed", (job, err) => {
      console.error(`Auto-fix job ${job.id} failed:`, err);
    });

    this.bugReportQueue.on("completed", (job, result) => {
      console.log(`Bug report job ${job.id} completed:`, result);
    });

    this.bugReportQueue.on("failed", (job, err) => {
      console.error(`Bug report job ${job.id} failed:`, err);
    });
  }

  async queueAutoFixJob(
    data: AutoFixJobData,
  ): Promise<Bull.Job<AutoFixJobData>> {
    const priority = this.getPriorityScore(data.priority);

    const job = await this.autoFixQueue.add("process-auto-fix", data, {
      priority,
      delay: 0, // Process immediately
      jobId: `auto-fix-${data.ticketSystem}-${data.ticketId}`, // Prevent duplicate jobs
    });

    console.log(
      `[DEBUG_LOG] Queued auto-fix job ${job.id} for ticket ${data.ticketId}`,
    );
    return job;
  }

  async queueBugReportProcessing(
    data: BugReportProcessingJobData,
  ): Promise<Bull.Job<BugReportProcessingJobData>> {
    const job = await this.bugReportQueue.add("process-bug-report", data, {
      priority: 0, // Normal priority
      delay: 1000, // Small delay to allow for immediate processing
    });

    console.log(
      `[DEBUG_LOG] Queued bug report processing job ${job.id} for report ${data.bugReportId}`,
    );
    return job;
  }

  async getAutoFixJobStatus(jobId: string): Promise<any> {
    const job = await this.autoFixQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      data: job.data,
      progress: job.progress(),
      state: await job.getState(),
      createdAt: new Date(job.timestamp),
      processedOn: job.processedOn ? new Date(job.processedOn) : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : null,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  }

  async getQueueStats(): Promise<any> {
    const [
      autoFixWaiting,
      autoFixActive,
      autoFixCompleted,
      autoFixFailed,
      bugReportWaiting,
      bugReportActive,
      bugReportCompleted,
      bugReportFailed,
    ] = await Promise.all([
      this.autoFixQueue.getWaiting(),
      this.autoFixQueue.getActive(),
      this.autoFixQueue.getCompleted(),
      this.autoFixQueue.getFailed(),
      this.bugReportQueue.getWaiting(),
      this.bugReportQueue.getActive(),
      this.bugReportQueue.getCompleted(),
      this.bugReportQueue.getFailed(),
    ]);

    return {
      autoFix: {
        waiting: autoFixWaiting.length,
        active: autoFixActive.length,
        completed: autoFixCompleted.length,
        failed: autoFixFailed.length,
      },
      bugReport: {
        waiting: bugReportWaiting.length,
        active: bugReportActive.length,
        completed: bugReportCompleted.length,
        failed: bugReportFailed.length,
      },
    };
  }

  private async processAutoFix(
    ticketId: string,
    ticketSystem: TicketSystem,
    repositoryUrl: string,
    issueData?: Ticket,
  ): Promise<void> {
    // This is where the actual auto-fix logic would be implemented
    // For MVP, we'll just simulate the process and update the database

    console.log(
      `[DEBUG_LOG] Starting auto-fix process for ${ticketSystem} ticket ${ticketId}`,
    );
    console.log(`[DEBUG_LOG] Repository URL: ${repositoryUrl}`);
    console.log(`[DEBUG_LOG] Issue data:`, issueData?.title);

    // Simulate AI analysis and fix generation
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Update database status
    const pool = require("../config/database").default;
    const client = await pool.connect();

    try {
      await client.query(
        `UPDATE auto_fix_queue 
         SET status = $1, started_at = $2 
         WHERE ticket_id = $3`,
        ["in_progress", new Date(), ticketId],
      );

      // Simulate more processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await client.query(
        `UPDATE auto_fix_queue 
         SET status = $1, completed_at = $2 
         WHERE ticket_id = $3`,
        ["completed", new Date(), ticketId],
      );

      console.log(`[DEBUG_LOG] Auto-fix completed for ticket ${ticketId}`);
    } catch (error) {
      await client.query(
        `UPDATE auto_fix_queue 
         SET status = $1, error_message = $2 
         WHERE ticket_id = $3`,
        ["failed", error.message, ticketId],
      );
      throw error;
    } finally {
      client.release();
    }
  }

  private async createTicketFromBugReport(
    bugReportId: string,
    ticketSystem: TicketSystem,
  ): Promise<void> {
    // Implementation would create ticket in the specified PM system
    console.log(
      `[DEBUG_LOG] Creating ticket in ${ticketSystem} for bug report ${bugReportId}`,
    );

    // This would use the appropriate PM integration service
    // For now, just simulate the process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(
      `[DEBUG_LOG] Ticket created successfully for bug report ${bugReportId}`,
    );
  }

  private getPriorityScore(priority: string): number {
    switch (priority.toLowerCase()) {
      case "critical":
        return 10;
      case "high":
        return 7;
      case "medium":
        return 5;
      case "low":
        return 2;
      default:
        return 5;
    }
  }

  async close(): Promise<void> {
    await Promise.all([
      this.autoFixQueue.close(),
      this.bugReportQueue.close(),
      this.redisClient.quit(),
    ]);
  }
}
