import { SQSHandler, SQSEvent } from "aws-lambda";
import { ViberatorWorker } from "./viberator";
import { LambdaPayload } from "./types";
import { CodingJobData, JobResult } from "./types";

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const payload: LambdaPayload = JSON.parse(record.body);
      console.log("Lambda processing task:", payload);

      // Validate required fields
      if (!payload.tenantId) {
        throw new Error("Missing tenantId in payload");
      }
      if (!payload.jobId) {
        throw new Error("Missing jobId in payload");
      }
      if (!payload.repository) {
        throw new Error("Missing repository in payload");
      }
      if (!payload.task) {
        throw new Error("Missing task in payload");
      }

      // Initialize worker with payload - handles credential fetching and injection
      const worker = new ViberatorWorker();
      await worker.initialize(payload);

      // Convert LambdaPayload to CodingJobData for executeTask
      const jobData: CodingJobData = {
        id: payload.jobId,
        tenantId: payload.tenantId,
        repository: payload.repository,
        task: payload.task,
        branch: payload.branch,
        baseBranch: payload.baseBranch,
        context: payload.context,
        settings: payload.settings,
        scm: payload.scm,
        timestamp: Date.now(),
      };

      const result: JobResult = await worker.executeTask(jobData);

      if (!result.success) {
        console.error(`Task failed: ${result.errorMessage}`);
        throw new Error(result.errorMessage || "Task execution failed");
      }

      console.log(`Task ${payload.jobId} finished successfully`);
    } catch (error) {
      console.error("Error in Lambda execution loop:", error);
      throw error;
    }
  }
};
