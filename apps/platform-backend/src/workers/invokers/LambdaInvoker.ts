import {
  LambdaClient,
  InvokeCommand,
  InvokeCommandOutput,
} from "@aws-sdk/client-lambda";
import type { Clanker, Project } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import { createChildLogger } from "../../config/logger";
import { SecretResolutionService } from "../../services/SecretResolutionService";
import { buildWorkerProjectConfig } from "./projectConfig";

const logger = createChildLogger({ invoker: "Lambda" });

interface LambdaDeploymentConfig {
  functionName?: string;
  functionArn?: string;
}

export class LambdaInvoker implements WorkerInvoker {
  readonly name = "LambdaInvoker";
  private client: LambdaClient;
  private secretResolutionService: SecretResolutionService;

  constructor(config?: { region?: string }) {
    this.client = new LambdaClient({
      region: config?.region || process.env.AWS_REGION || "eu-west-1",
    });
    this.secretResolutionService = new SecretResolutionService();
  }

  async invoke(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<InvocationResult> {
    const functionName = this.getFunctionName(clanker);
    if (!functionName) {
      throw new WorkerError(
        "Lambda function name or ARN not configured in clanker deploymentConfig",
        ErrorClassification.PERMANENT,
      );
    }

    const payload = await this.buildPayload(job, clanker, project);

    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event", // Async - returns 202, no response payload
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      const response: InvokeCommandOutput = await this.client.send(command);

      const executionId =
        response.$metadata.requestId || "lambda-" + Date.now();

      logger.info("Worker invoked", {
        jobId: job.id,
        functionName,
        executionId,
        statusCode: response.StatusCode, // Should be 202 for Event
      });

      return {
        executionId,
        workerType: "lambda",
      };
    } catch (error) {
      throw this.classifyError(error, functionName);
    }
  }

  private classifyError(error: unknown, functionName: string): WorkerError {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const errorName = err.name || "";
    const statusCode = err.$metadata?.httpStatusCode;

    // Transient errors - can be retried
    const transientErrors = [
      "TooManyRequestsException",
      "ServiceException",
      "EC2ThrottledException",
      "EC2UnexpectedException",
      "ResourceNotReadyException",
      "ResourceConflictException",
      "EFSIOException",
      "EFSMountConnectivityException",
      "EFSMountTimeoutException",
    ];

    if (
      transientErrors.includes(errorName) ||
      (statusCode && statusCode >= 500)
    ) {
      return new WorkerError(
        "Lambda invocation failed (transient): " + (errorName || err.message),
        ErrorClassification.TRANSIENT,
        error,
      );
    }

    // Permanent errors - do not retry
    return new WorkerError(
      "Lambda invocation failed (permanent): " + (errorName || err.message),
      ErrorClassification.PERMANENT,
      error,
    );
  }

  private getFunctionName(clanker: Clanker): string | undefined {
    const config = clanker.deploymentConfig as unknown as
      | LambdaDeploymentConfig
      | undefined;
    return config?.functionArn || config?.functionName;
  }

  private async buildPayload(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<object> {
    const secretMetadata =
      await this.secretResolutionService.getSecretMetadataForClanker(
        clanker.secretIds || [],
      );

    return {
      workerType: "lambda",
      tenantId: job.tenantId,
      jobId: job.id,
      clankerId: clanker.id,
      repository: job.repository,
      task: job.task,
      branch: job.branch,
      baseBranch: job.baseBranch,
      context: job.context,
      settings: job.settings,
      deploymentConfig: clanker.deploymentConfig,
      agent: clanker.agent || "claude-code",
      secrets: secretMetadata,
      callbackToken: job.callbackToken,
      projectConfig: buildWorkerProjectConfig(project),
      scm: job.scm,
      overrides: job.overrides,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.client !== undefined;
  }
}
