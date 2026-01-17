import { SQSHandler, SQSEvent } from "aws-lambda";
import { ViberatorWorker } from "./viberator";
import { CodingJobData } from "./types";
import { getTenantSecret } from "../utils/secrets";

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const jobData: CodingJobData = JSON.parse(record.body);
      console.log(jobData);
      console.log(`Lambda processing task: ${jobData.id}`);

      // Validate tenantId
      if (!jobData.tenantId) {
        throw new Error("Missing tenantId in job data");
      }

      const githubToken = await getTenantSecret(
        jobData.tenantId,
        "GITHUB_TOKEN",
      );
      const claudeApiKey = await getTenantSecret(
        jobData.tenantId,
        "CLAUDE_CODE_API_KEY",
      );

      if (!githubToken) {
        throw new Error(`Missing GITHUB_TOKEN for tenant ${jobData.tenantId}`);
      }
      if (!claudeApiKey) {
        throw new Error(
          `Missing CLAUDE_CODE_API_KEY for tenant ${jobData.tenantId}`,
        );
      }

      console.log("Retrieved tenant credentials successfully");

      // Set credentials in environment BEFORE initializing worker
      process.env.GITHUB_TOKEN = githubToken;
      process.env.CLAUDE_CODE_API_KEY = claudeApiKey;

      // Initialize worker with tenant credentials in environment
      const codingWorker = new ViberatorWorker();
      await codingWorker.initialize();
      const jobId = `${jobData.id}_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result = await codingWorker.executeTask({ ...jobData, id: jobId });

      if (!result.success) {
        // We log it and throw to ensure SQS retries the message if configured
        console.error(`Task failed: ${result.errorMessage}`);
        throw new Error(result.errorMessage);
      }

      console.log(`Task ${jobData.id} finished successfully`);
    } catch (error) {
      console.error("Error in Lambda execution loop:", error);
      throw error; // Re-throwing tells SQS the batch (or item) failed
    } finally {
      // Clear credentials after execution
      delete process.env.GITHUB_TOKEN;
      delete process.env.CLAUDE_CODE_API_KEY;
    }
  }
};
