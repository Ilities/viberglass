import {
  LambdaClient,
  InvokeCommand,
  GetFunctionCommand,
  InvokeCommandOutput,
} from "@aws-sdk/client-lambda";
import { DEFAULT_AGENT_TYPE } from "@viberglass/types";
import type { Clanker, Project } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import { createChildLogger } from "../../config/logger";
import { SecretResolutionService } from "../../services/SecretResolutionService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { buildWorkerProjectConfig } from "./projectConfig";
import { resolveClankerConfig } from "../../clanker-config";

const logger = createChildLogger({ invoker: "Lambda" });

interface LambdaDeploymentConfig {
  functionName?: string;
  functionArn?: string;
}

interface LambdaErrorDetails {
  name?: string;
  message?: string;
  statusCode?: number;
  requestId?: string;
  extendedRequestId?: string;
  cfId?: string;
  retryable?: boolean;
}

interface LambdaInvokeContext {
  jobId: string;
  functionName: string;
  payloadMode: "bootstrap" | "generated";
  payloadBytes: number;
  hasPlatformApiUrl: boolean;
}

export class LambdaInvoker implements WorkerInvoker {
  readonly name = "LambdaInvoker";
  private client: LambdaClient;
  private secretResolutionService: SecretResolutionService;
  private credentialRequirementsService: CredentialRequirementsService;

  constructor(config?: { region?: string }) {
    this.client = new LambdaClient({
      region: config?.region || process.env.AWS_REGION || "eu-west-1",
    });
    this.secretResolutionService = new SecretResolutionService();
    this.credentialRequirementsService = new CredentialRequirementsService();
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

    const payloadMode: LambdaInvokeContext["payloadMode"] = job.bootstrapPayload
      ? "bootstrap"
      : "generated";
    const platformApiUrl = this.resolvePlatformApiUrl();
    const basePayload =
      job.bootstrapPayload || (await this.buildPayload(job, clanker, project));
    const payload = this.injectPlatformApiUrl(
      basePayload,
      platformApiUrl,
    );
    const payloadJson = JSON.stringify(payload);
    const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
    const context: LambdaInvokeContext = {
      jobId: job.id,
      functionName,
      payloadMode,
      payloadBytes,
      hasPlatformApiUrl:
        typeof payload["platformApiUrl"] === "string" &&
        payload["platformApiUrl"].length > 0,
    };

    logger.debug("Invoking Lambda function", {
      jobId: job.id,
      clankerId: clanker.id,
      functionName,
      invocationType: "Event",
      payloadMode,
      payloadBytes,
      hasPlatformApiUrl: context.hasPlatformApiUrl,
      hasCallbackToken: Boolean(job.callbackToken),
      hasProjectConfig: Boolean(project),
      repository: job.repository,
      branch: job.branch,
      baseBranch: job.baseBranch,
    });

    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event", // Async - returns 202, no response payload
        Payload: Buffer.from(payloadJson),
      });

      const response: InvokeCommandOutput = await this.client.send(command);

      const executionId =
        response.$metadata.requestId || "lambda-" + Date.now();

      logger.info("Worker invoked", {
        jobId: job.id,
        functionName,
        executionId,
        statusCode: response.StatusCode, // Should be 202 for Event
        requestId: response.$metadata.requestId,
        attempts: response.$metadata.attempts,
        totalRetryDelay: response.$metadata.totalRetryDelay,
      });

      if (response.StatusCode !== 202) {
        logger.warn("Unexpected Lambda invoke status code", {
          jobId: job.id,
          functionName,
          statusCode: response.StatusCode,
          requestId: response.$metadata.requestId,
        });
      }

      return {
        executionId,
        workerType: "lambda",
      };
    } catch (error) {
      const errorDetails = this.extractErrorDetails(error);
      if (errorDetails.name === "ResourceConflictException") {
        await this.logFunctionDiagnostics(context);
      }
      throw this.classifyError(error, errorDetails, context);
    }
  }

  private classifyError(
    error: unknown,
    errorDetails: LambdaErrorDetails,
    context: LambdaInvokeContext,
  ): WorkerError {
    const errorName = errorDetails.name || "";
    const statusCode = errorDetails.statusCode;
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

    const isTransient =
      transientErrors.includes(errorName) ||
      (statusCode !== undefined && statusCode >= 500);
    const retryAfterMs = isTransient
      ? this.getSuggestedRetryDelayMs(errorDetails)
      : undefined;

    logger.warn("Lambda invocation request failed", {
      jobId: context.jobId,
      functionName: context.functionName,
      payloadMode: context.payloadMode,
      payloadBytes: context.payloadBytes,
      hasPlatformApiUrl: context.hasPlatformApiUrl,
      classification: isTransient ? "transient" : "permanent",
      errorName: errorDetails.name,
      errorMessage: errorDetails.message,
      statusCode: errorDetails.statusCode,
      requestId: errorDetails.requestId,
      extendedRequestId: errorDetails.extendedRequestId,
      cfId: errorDetails.cfId,
      retryable: errorDetails.retryable,
      retryAfterMs,
    });

    if (isTransient) {
      return new WorkerError(
        "Lambda invocation failed (transient): " +
          (errorName || errorDetails.message || "Unknown Lambda error"),
        ErrorClassification.TRANSIENT,
        error,
        retryAfterMs,
      );
    }

    // Permanent errors - do not retry
    return new WorkerError(
      "Lambda invocation failed (permanent): " +
        (errorName || errorDetails.message || "Unknown Lambda error"),
      ErrorClassification.PERMANENT,
      error,
    );
  }

  private extractErrorDetails(error: unknown): LambdaErrorDetails {
    if (!(typeof error === "object" && error !== null)) {
      return {};
    }

    const metadataValue = Reflect.get(error, "$metadata");
    const metadata =
      typeof metadataValue === "object" && metadataValue !== null
        ? metadataValue
        : null;
    const retryableValue = Reflect.get(error, "$retryable");
    const nameValue = Reflect.get(error, "name");
    const messageValue = Reflect.get(error, "message");
    const statusCodeValue = metadata
      ? Reflect.get(metadata, "httpStatusCode")
      : undefined;
    const requestIdValue = metadata ? Reflect.get(metadata, "requestId") : undefined;
    const extendedRequestIdValue = metadata
      ? Reflect.get(metadata, "extendedRequestId")
      : undefined;
    const cfIdValue = metadata ? Reflect.get(metadata, "cfId") : undefined;

    return {
      name: typeof nameValue === "string" ? nameValue : undefined,
      message: typeof messageValue === "string" ? messageValue : undefined,
      statusCode: typeof statusCodeValue === "number" ? statusCodeValue : undefined,
      requestId: typeof requestIdValue === "string" ? requestIdValue : undefined,
      extendedRequestId:
        typeof extendedRequestIdValue === "string"
          ? extendedRequestIdValue
          : undefined,
      cfId: typeof cfIdValue === "string" ? cfIdValue : undefined,
      retryable: typeof retryableValue === "object" && retryableValue !== null,
    };
  }

  private async logFunctionDiagnostics(
    context: LambdaInvokeContext,
  ): Promise<void> {
    try {
      const response = await this.client.send(
        new GetFunctionCommand({ FunctionName: context.functionName }),
      );

      logger.warn("Lambda function diagnostics after conflict", {
        jobId: context.jobId,
        functionName: context.functionName,
        state: response.Configuration?.State,
        stateReason: response.Configuration?.StateReason,
        stateReasonCode: response.Configuration?.StateReasonCode,
        lastUpdateStatus: response.Configuration?.LastUpdateStatus,
        lastUpdateStatusReason: response.Configuration?.LastUpdateStatusReason,
        lastModified: response.Configuration?.LastModified,
        revisionId: response.Configuration?.RevisionId,
      });
    } catch (error) {
      const details = this.extractErrorDetails(error);
      logger.warn("Lambda diagnostics lookup failed", {
        jobId: context.jobId,
        functionName: context.functionName,
        errorName: details.name,
        errorMessage: details.message,
        statusCode: details.statusCode,
        requestId: details.requestId,
      });
    }
  }

  private getSuggestedRetryDelayMs(
    errorDetails: LambdaErrorDetails,
  ): number | undefined {
    if (errorDetails.name !== "ResourceConflictException") {
      return undefined;
    }

    const errorMessage = errorDetails.message || "";
    if (/\bPending\b/i.test(errorMessage)) {
      // Pending means Lambda is not ready to invoke yet; short retries are usually ineffective.
      return 15000;
    }

    return 5000;
  }

  private getFunctionName(clanker: Clanker): string | undefined {
    const resolvedConfig = resolveClankerConfig(clanker).config;
    if (resolvedConfig.strategy.type !== "lambda") {
      return undefined;
    }

    const config: LambdaDeploymentConfig = {
      functionArn: resolvedConfig.strategy.functionArn,
      functionName: resolvedConfig.strategy.functionName,
    };

    return config.functionArn || config.functionName;
  }

  private resolvePlatformApiUrl(): string | undefined {
    const value = process.env.PLATFORM_API_URL?.trim();
    return value && value.length > 0 ? value.replace(/\/+$/, "") : undefined;
  }

  private injectPlatformApiUrl(
    payload: Record<string, unknown>,
    platformApiUrl?: string,
  ): Record<string, unknown> {
    if (!platformApiUrl) {
      return payload;
    }

    if (
      typeof payload["platformApiUrl"] === "string" &&
      payload["platformApiUrl"].length > 0
    ) {
      return payload;
    }

    return {
      ...payload,
      platformApiUrl,
    };
  }

  private async buildPayload(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<Record<string, unknown>> {
    const secretMetadata =
      await this.secretResolutionService.getSecretMetadataForClanker(
        clanker.secretIds || [],
      );
    const requiredCredentials =
      await this.credentialRequirementsService.getRequiredCredentialsForClanker(
        clanker,
      );

    const payload: Record<string, unknown> = {
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
      instructionFiles: job.context?.instructionFiles ?? [],
      agentConfigFile: job.agentConfigFile,
      deploymentConfig: clanker.deploymentConfig,
      agent: clanker.agent || DEFAULT_AGENT_TYPE,
      secrets: secretMetadata,
      requiredCredentials,
      callbackToken: job.callbackToken,
      projectConfig: buildWorkerProjectConfig(project),
      scm: job.scm,
      overrides: job.overrides,
    };

    return this.injectPlatformApiUrl(payload, this.resolvePlatformApiUrl());
  }

  async isAvailable(): Promise<boolean> {
    return this.client !== undefined;
  }
}
