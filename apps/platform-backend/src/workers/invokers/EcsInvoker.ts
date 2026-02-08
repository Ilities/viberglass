import {
  ECSClient,
  RunTaskCommand,
  RunTaskCommandOutput,
} from "@aws-sdk/client-ecs";
import type { Clanker, Project } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import { createChildLogger } from "../../config/logger";
import { SecretResolutionService } from "../../services/SecretResolutionService";

const logger = createChildLogger({ invoker: "ECS" });

interface EcsDeploymentConfig {
  clusterArn: string;
  taskDefinitionArn: string;
  launchType?: "FARGATE" | "EC2";
  subnetIds: string[];
  securityGroupIds: string[];
  assignPublicIp?: "ENABLED" | "DISABLED";
  containerName?: string;
}

export class EcsInvoker implements WorkerInvoker {
  readonly name = "EcsInvoker";
  private client: ECSClient;
  private secretResolutionService: SecretResolutionService;

  constructor(config?: { region?: string }) {
    this.client = new ECSClient({
      region: config?.region || process.env.AWS_REGION || "eu-west-1",
    });
    this.secretResolutionService = new SecretResolutionService();
  }

  async invoke(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<InvocationResult> {
    const rawConfig = clanker.deploymentConfig as unknown as
      | EcsDeploymentConfig
      | undefined;

    // Apply env var fallbacks for managed mode
    const ecsConfig: EcsDeploymentConfig = {
      clusterArn:
        rawConfig?.clusterArn || process.env.VIBERATOR_ECS_CLUSTER_ARN || "",
      taskDefinitionArn: rawConfig?.taskDefinitionArn || "",
      launchType: rawConfig?.launchType,
      subnetIds: rawConfig?.subnetIds?.length
        ? rawConfig.subnetIds
        : process.env.VIBERATOR_ECS_SUBNET_IDS?.split(",").filter(Boolean) ||
          [],
      securityGroupIds: rawConfig?.securityGroupIds?.length
        ? rawConfig.securityGroupIds
        : process.env.VIBERATOR_ECS_SECURITY_GROUP_IDS?.split(",").filter(
            Boolean,
          ) || [],
      assignPublicIp: rawConfig?.assignPublicIp,
      containerName: rawConfig?.containerName,
    };

    if (!ecsConfig.clusterArn || !ecsConfig.taskDefinitionArn) {
      throw new WorkerError(
        "ECS cluster ARN and task definition ARN required in clanker deploymentConfig",
        ErrorClassification.PERMANENT,
      );
    }

    const payload = job.bootstrapPayload || (await this.buildPayload(job, clanker, project));
    const payloadJson = JSON.stringify(payload);
    const canUseJobRef = Boolean(
      job.bootstrapPayload && job.callbackToken && process.env.PLATFORM_API_URL,
    );
    const containerName = ecsConfig.containerName || "worker";
    const environment = [
      { name: "TENANT_ID", value: job.tenantId },
      { name: "JOB_ID", value: job.id },
      {
        name: "SECRETS_SSM_PREFIX",
        value: process.env.SECRETS_SSM_PREFIX || "/viberator/secrets",
      },
    ];

    if (process.env.SSM_PARAMETER_PREFIX) {
      environment.push({
        name: "SSM_PARAMETER_PREFIX",
        value: process.env.SSM_PARAMETER_PREFIX,
      });
    }

    if (process.env.PLATFORM_API_URL) {
      environment.push({
        name: "PLATFORM_API_URL",
        value: process.env.PLATFORM_API_URL,
      });
    }

    if (canUseJobRef && job.callbackToken) {
      environment.push({
        name: "CALLBACK_TOKEN",
        value: job.callbackToken,
      });
    }

    try {
      const command = new RunTaskCommand({
        cluster: ecsConfig.clusterArn,
        taskDefinition: ecsConfig.taskDefinitionArn,
        launchType: ecsConfig.launchType || "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ecsConfig.subnetIds,
            securityGroups: ecsConfig.securityGroupIds,
            assignPublicIp: ecsConfig.assignPublicIp || "DISABLED",
          },
        },
        overrides: {
          containerOverrides: [
            {
              name: containerName,
              command: canUseJobRef
                ? ["node", "dist/cli-worker.js", "--job-ref", job.id]
                : ["node", "dist/cli-worker.js", "--job-data", payloadJson],
              environment,
            },
          ],
        },
      });

      logger.debug("Invoking ECS task", {
        jobId: job.id,
        cluster: ecsConfig.clusterArn,
        taskDefinition: ecsConfig.taskDefinitionArn,
        containerName,
        subnetCount: ecsConfig.subnetIds.length,
        securityGroupCount: ecsConfig.securityGroupIds.length,
        payloadMode: canUseJobRef ? "job-ref" : "inline",
      });

      const response: RunTaskCommandOutput = await this.client.send(command);

      // Check for failures in response
      if (response.failures && response.failures.length > 0) {
        const failure = response.failures[0];
        throw this.classifyEcsFailure(failure);
      }

      const taskArn = response.tasks?.[0]?.taskArn;
      if (!taskArn) {
        throw new WorkerError(
          "ECS RunTask returned no task ARN",
          ErrorClassification.TRANSIENT,
        );
      }

      logger.info("Worker task started", {
        jobId: job.id,
        taskArn,
        cluster: ecsConfig.clusterArn,
      });

      return {
        executionId: taskArn,
        workerType: "ecs",
      };
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw this.classifyError(error);
    }
  }

  private classifyEcsFailure(failure: {
    reason?: string;
    detail?: string;
  }): WorkerError {
    const reason = failure.reason || "";

    // Transient: AGENT disconnected, capacity issues
    if (reason === "AGENT" || reason.includes("CAPACITY")) {
      return new WorkerError(
        "ECS task failed to start (transient): " +
          reason +
          " - " +
          failure.detail,
        ErrorClassification.TRANSIENT,
        failure,
      );
    }

    // Permanent: RESOURCE, ATTRIBUTE, MISSING, INACTIVE
    return new WorkerError(
      "ECS task failed to start (permanent): " +
        reason +
        " - " +
        failure.detail,
      ErrorClassification.PERMANENT,
      failure,
    );
  }

  private classifyError(error: unknown): WorkerError {
    const err = error as { name?: string; message?: string; $metadata?: any };
    const errorName = err.name || "";

    // Log full error details for debugging
    logger.error("ECS invocation error", {
      errorName,
      message: err.message,
      metadata: err.$metadata,
    });

    // Transient errors
    if (errorName === "ServerException") {
      return new WorkerError(
        "ECS server error (transient): " + err.message,
        ErrorClassification.TRANSIENT,
        error,
      );
    }

    // Permanent: ClusterNotFoundException, InvalidParameterException, etc.
    return new WorkerError(
      "ECS invocation failed (permanent): " + (errorName || err.message),
      ErrorClassification.PERMANENT,
      error,
    );
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
    const requiredCredentials = secretMetadata.map((secret) => secret.name);

    return {
      workerType: "docker",
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
      requiredCredentials,
      callbackToken: job.callbackToken,
      clankerConfig: clanker,
      projectConfig: project
        ? {
            id: project.id,
            name: project.name,
            autoFixTags: project.autoFixTags,
            customFieldMappings: project.customFieldMappings,
            workerSettings: project.workerSettings,
          }
        : undefined,
      overrides: job.overrides,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.client !== undefined;
  }
}
