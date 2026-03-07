import { ViberatorWorker } from "../core/ViberatorWorker";
import { LambdaPayload } from "../core/types";
import { CodingJobData, JobResult } from "../core/types";
import { ClankerAgentAuthLifecycleFactory } from "../runtime/ClankerAgentAuthLifecycleFactory";
import { ClankerAgentEndpointEnvironmentFactory } from "../runtime/ClankerAgentEndpointEnvironmentFactory";

// Tell Lambda not to wait for the event loop to empty before freezing.
// We manage the lifecycle manually to ensure callbacks complete.
export const callbackWaitsForEmptyEventLoop = false;

interface SqsRecordLike {
  body: unknown;
}

interface SqsEventLike {
  Records: SqsRecordLike[];
}

interface BodyWrappedEventLike {
  body: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSqsRecordLike = (value: unknown): value is SqsRecordLike =>
  isRecord(value) && "body" in value;

const isSqsEventLike = (value: unknown): value is SqsEventLike => {
  if (!isRecord(value) || !("Records" in value)) {
    return false;
  }

  const records = value["Records"];
  return Array.isArray(records) && records.every(isSqsRecordLike);
};

const isBodyWrappedEventLike = (value: unknown): value is BodyWrappedEventLike =>
  isRecord(value) && "body" in value;

const isS3InstructionFile = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["fileType"] === "string" &&
  typeof value["s3Url"] === "string";

const isLambdaPayload = (value: unknown): value is LambdaPayload => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value["workerType"] === "lambda" &&
    typeof value["tenantId"] === "string" &&
    typeof value["jobId"] === "string" &&
    typeof value["clankerId"] === "string" &&
    typeof value["repository"] === "string" &&
    typeof value["task"] === "string" &&
    Array.isArray(value["instructionFiles"]) &&
    value["instructionFiles"].every(isS3InstructionFile) &&
    Array.isArray(value["requiredCredentials"]) &&
    value["requiredCredentials"].every(
      (credential) => typeof credential === "string",
    )
  );
};

const parsePayloadValue = (value: unknown, source: string): LambdaPayload => {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsePayloadValue(parsed, source);
    } catch {
      throw new Error(`Invalid JSON payload in ${source}`);
    }
  }

  if (isLambdaPayload(value)) {
    return value;
  }

  throw new Error(`Invalid Lambda payload in ${source}`);
};

const extractPayloads = (event: unknown): LambdaPayload[] => {
  if (isSqsEventLike(event)) {
    return event.Records.map((record, index) =>
      parsePayloadValue(record.body, `event.Records[${index}].body`),
    );
  }

  if (isBodyWrappedEventLike(event)) {
    return [parsePayloadValue(event.body, "event.body")];
  }

  return [parsePayloadValue(event, "event")];
};

/**
 * Small delay to allow in-flight HTTP callbacks to fully complete.
 * Lambda can freeze the execution context before TCP connections close.
 */
const drainEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 500));

export const handler = async (event: unknown): Promise<void> => {
  const payloads = extractPayloads(event);

  for (const payload of payloads) {
    try {
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
      const worker = new ViberatorWorker(
        new ClankerAgentAuthLifecycleFactory(),
        new ClankerAgentEndpointEnvironmentFactory(),
      );
      await worker.initialize(payload);

      // Convert LambdaPayload to CodingJobData for executeTask
      const jobData: CodingJobData = {
        id: payload.jobId,
        jobKind: payload.jobKind,
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

      // Allow in-flight HTTP callbacks (result/progress) to fully complete
      // before Lambda freezes the execution context.
      await drainEventLoop();
    } catch (error) {
      console.error("Error in Lambda execution loop:", error);
      throw error;
    }
  }

  // Final drain to ensure all callbacks complete before handler returns
  await drainEventLoop();
};
