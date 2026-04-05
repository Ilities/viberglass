import type { Context } from "aws-lambda";
import { ViberatorWorker } from "../core/ViberatorWorker";
import { LambdaPayload, S3InstructionFile } from "../core/types";
import { CodingJobData, JobResult } from "../core/types";
import { ClankerAgentAuthLifecycleFactory } from "../runtime/ClankerAgentAuthLifecycleFactory";
import { ClankerAgentEndpointEnvironmentFactory } from "../runtime/ClankerAgentEndpointEnvironmentFactory";

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

const isBodyWrappedEventLike = (
  value: unknown,
): value is BodyWrappedEventLike => isRecord(value) && "body" in value;

const isS3InstructionFile = (value: unknown): value is S3InstructionFile =>
  isRecord(value) &&
  typeof value["fileType"] === "string" &&
  typeof value["s3Url"] === "string";

const isContextInstructionFile = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["fileType"] === "string" &&
  typeof value["content"] === "string";

const isInstructionFile = (value: unknown): boolean =>
  isS3InstructionFile(value) || isContextInstructionFile(value);

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
    value["instructionFiles"].every(isInstructionFile) &&
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

export const handler = async (
  event: unknown,
  context?: Context,
): Promise<void> => {
  // Tell Lambda not to wait for the event loop to drain after this handler
  // resolves. sendResult is fully awaited before we return; remaining async
  // operations (log-batch flushes) can be safely abandoned.
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

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
    } catch (error) {
      console.error("Error in Lambda execution loop:", error);
      throw error;
    }
  }
};
