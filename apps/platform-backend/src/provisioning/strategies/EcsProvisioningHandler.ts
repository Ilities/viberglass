import type { Clanker } from "@viberglass/types";
import { isObjectRecord } from "@viberglass/types";
import { mergeProvisionedStrategyIntoConfig } from "../../clanker-config/mergeProvisionedConfig";
import type { ProvisioningStrategyHandler } from "../ProvisioningStrategyHandler";
import type { EcsClientPort } from "../ports/EcsClientPort";
import { getErrorMessage, getErrorName } from "../shared/errorUtils";
import { getEcsStrategyConfig, getNonEmptyString } from "../shared/configHelpers";
import { getWorkerImageForClanker } from "../shared/workerImage";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "../types";
import { EcsTaskDefinitionProvisioner } from "./EcsTaskDefinitionProvisioner";
import type { EcsProvisioningConfig } from "./ecsTypes";

function cloneTaskDefinitionInput(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const cloned = JSON.parse(JSON.stringify(value));
  return isObjectRecord(cloned) ? cloned : null;
}

function toEcsProvisioningConfig(clanker: Clanker): EcsProvisioningConfig {
  const strategy = getEcsStrategyConfig(clanker);
  return {
    type: "ecs",
    provisioningMode: strategy.provisioningMode,
    clusterArn: strategy.clusterArn,
    taskDefinitionArn: strategy.taskDefinitionArn,
    taskDefinition: cloneTaskDefinitionInput(strategy.taskDefinition) || undefined,
    taskDefinitionDetails: strategy.taskDefinitionDetails,
    family: strategy.family,
    containerImage: strategy.containerImage,
    containerName: strategy.containerName,
    executionRoleArn: strategy.executionRoleArn,
    taskRoleArn: strategy.taskRoleArn,
    cpu: strategy.cpu,
    memory: strategy.memory,
    logGroup: strategy.logGroup,
    logStreamPrefix: strategy.logStreamPrefix,
    region: strategy.region,
  };
}

export class EcsProvisioningHandler implements ProvisioningStrategyHandler {
  private readonly taskDefinitionProvisioner: EcsTaskDefinitionProvisioner;

  constructor(private readonly ecsClient: EcsClientPort) {
    this.taskDefinitionProvisioner = new EcsTaskDefinitionProvisioner(ecsClient);
  }

  getPreflightError(clanker: Clanker): string | null {
    const config = toEcsProvisioningConfig(clanker);
    const provisioningMode =
      config.provisioningMode === "prebuilt" ? "prebuilt" : "managed";

    const clusterArn =
      getNonEmptyString(config.clusterArn) ||
      getNonEmptyString(process.env.VIBERATOR_ECS_CLUSTER_ARN);

    if (provisioningMode === "prebuilt") {
      if (!getNonEmptyString(config.taskDefinitionArn)) {
        return "ECS pre-built mode requires taskDefinitionArn.";
      }
      if (!clusterArn) {
        return "ECS pre-built mode requires clusterArn or VIBERATOR_ECS_CLUSTER_ARN.";
      }
      return null;
    }

    const executionRoleArn =
      getNonEmptyString(config.executionRoleArn) ||
      getNonEmptyString(process.env.VIBERATOR_ECS_EXECUTION_ROLE_ARN);
    const taskRoleArn =
      getNonEmptyString(config.taskRoleArn) ||
      getNonEmptyString(process.env.VIBERATOR_ECS_TASK_ROLE_ARN);
    const containerImage =
      getNonEmptyString(config.containerImage) ||
      getNonEmptyString(process.env.VIBERATOR_ECS_CONTAINER_IMAGE);

    const missing: string[] = [];
    if (!executionRoleArn) {
      missing.push("executionRoleArn (or VIBERATOR_ECS_EXECUTION_ROLE_ARN)");
    }
    if (!taskRoleArn) {
      missing.push("taskRoleArn (or VIBERATOR_ECS_TASK_ROLE_ARN)");
    }
    if (!containerImage) {
      missing.push("containerImage (or VIBERATOR_ECS_CONTAINER_IMAGE)");
    }
    if (!clusterArn) {
      missing.push("clusterArn (or VIBERATOR_ECS_CLUSTER_ARN)");
    }

    if (missing.length === 0) {
      return null;
    }

    return `ECS managed provisioning is missing required configuration: ${missing.join(
      ", ",
    )}. Set viberglass:workerStack in infra/platform and run pulumi up.`;
  }

  async provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = toEcsProvisioningConfig(clanker);
    if (!config.containerImage) {
      const selectedImage = getWorkerImageForClanker(clanker, "ecs");
      if (selectedImage) {
        config.containerImage = selectedImage;
      }
    }

    await progress?.("Registering ECS task definition...");
    const { taskDefinitionArn, taskDefinitionDetails } =
      await this.taskDefinitionProvisioner.ensureTaskDefinition(clanker, config);

    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...config,
      taskDefinitionArn,
      taskDefinitionDetails,
      clusterArn: config.clusterArn || process.env.VIBERATOR_ECS_CLUSTER_ARN,
    });

    const availability = await this.checkAvailability({
      ...clanker,
      deploymentConfig,
    });

    return {
      deploymentConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  async checkAvailability(clanker: Clanker): Promise<AvailabilityResult> {
    const config = toEcsProvisioningConfig(clanker);
    if (!config.taskDefinitionArn) {
      return {
        status: "inactive",
        statusMessage: "ECS task definition not configured",
      };
    }

    try {
      await this.ecsClient.describeTaskDefinition(config.taskDefinitionArn);
      return {
        status: "active",
        statusMessage: `ECS task definition ready: ${config.taskDefinitionArn}`,
      };
    } catch (error) {
      if (getErrorName(error) === "ClientException") {
        return {
          status: "inactive",
          statusMessage: "ECS task definition not found",
        };
      }

      return {
        status: "failed",
        statusMessage: `ECS availability check failed: ${getErrorMessage(
          error,
          "Unknown error",
        )}`,
      };
    }
  }
}
