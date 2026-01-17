import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { ViberatorWorker } from "./viberator";
import { CodingJobData, JobResult } from "./types";

async function main() {
  const codingWorker = new ViberatorWorker();
  await codingWorker.initialize();

  const redisConnection = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: null,
  });

  console.log("Starting BullMQ Worker...");

  const worker = new Worker<CodingJobData, JobResult>(
    "coding-agent-jobs",
    async (job: Job<CodingJobData>) => {
      // Direct call to the shared logic
      return await codingWorker.executeTask(job.data);
    },
    {
      connection: redisConnection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1"),
    },
  );

  worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`Job ${job?.id} failed:`, err),
  );

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down BullMQ worker...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
