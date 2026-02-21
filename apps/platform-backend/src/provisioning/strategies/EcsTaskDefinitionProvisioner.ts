import type {
  RegisterTaskDefinitionCommandInput,
  TaskDefinition,
} from "@aws-sdk/client-ecs";
import type { Clanker } from "@viberglass/types";
import type { EcsClientPort } from "../ports/EcsClientPort";
import {
  buildDefaultTaskDefinition,
  buildEcsFamilyName,
  mapTaskDefinitionDetails,
} from "./ecsTaskDefinitionUtils";
import type { EcsProvisioningConfig, EcsTaskDefinitionDetails } from "./ecsTypes";

export class EcsTaskDefinitionProvisioner {
  constructor(private readonly ecsClient: EcsClientPort) {}

  async ensureTaskDefinition(
    clanker: Clanker,
    config: EcsProvisioningConfig,
  ): Promise<{
    taskDefinitionArn: string;
    taskDefinitionDetails: EcsTaskDefinitionDetails;
  }> {
    const explicitTaskDefinition = this.normalizeTaskDefinition(
      config.taskDefinition,
    );

    const taskDefinition =
      explicitTaskDefinition ||
      (await this.buildTaskDefinitionFromExisting(config.taskDefinitionArn)) ||
      buildDefaultTaskDefinition(clanker, config);

    const nextTaskDefinition: RegisterTaskDefinitionCommandInput = {
      ...taskDefinition,
    };

    if (
      config.containerImage &&
      nextTaskDefinition.containerDefinitions?.length
    ) {
      const targetContainerName =
        config.containerName ||
        nextTaskDefinition.containerDefinitions[0]?.name;

      nextTaskDefinition.containerDefinitions =
        nextTaskDefinition.containerDefinitions.map((container) =>
          container.name === targetContainerName
            ? { ...container, image: config.containerImage }
            : container,
        );
    }

    if (!nextTaskDefinition.containerDefinitions?.length) {
      throw new Error("ECS task definition requires container definitions");
    }

    if (!nextTaskDefinition.family) {
      nextTaskDefinition.family = buildEcsFamilyName(clanker);
    }

    const registeredTaskDefinition =
      await this.ecsClient.registerTaskDefinition(nextTaskDefinition);
    const taskDefinitionArn = registeredTaskDefinition?.taskDefinitionArn;
    if (!taskDefinitionArn) {
      throw new Error("ECS task definition registration did not return an ARN");
    }

    return {
      taskDefinitionArn,
      taskDefinitionDetails: mapTaskDefinitionDetails(registeredTaskDefinition),
    };
  }

  private normalizeTaskDefinition(
    value: EcsProvisioningConfig["taskDefinition"],
  ): RegisterTaskDefinitionCommandInput | null {
    if (!value) {
      return null;
    }

    const cloned = JSON.parse(JSON.stringify(value));
    if (typeof cloned !== "object" || cloned === null) {
      return null;
    }

    return cloned;
  }

  private async buildTaskDefinitionFromExisting(
    taskDefinitionArn: string | undefined,
  ): Promise<RegisterTaskDefinitionCommandInput | null> {
    if (!taskDefinitionArn) {
      return null;
    }

    const existingTaskDefinition =
      await this.ecsClient.describeTaskDefinition(taskDefinitionArn);

    return this.mapExistingTaskDefinition(existingTaskDefinition);
  }

  private mapExistingTaskDefinition(
    taskDefinition: TaskDefinition | null,
  ): RegisterTaskDefinitionCommandInput | null {
    if (!taskDefinition) {
      return null;
    }

    return {
      family: taskDefinition.family,
      taskRoleArn: taskDefinition.taskRoleArn,
      executionRoleArn: taskDefinition.executionRoleArn,
      networkMode: taskDefinition.networkMode,
      containerDefinitions: taskDefinition.containerDefinitions,
      volumes: taskDefinition.volumes,
      placementConstraints: taskDefinition.placementConstraints,
      requiresCompatibilities: taskDefinition.requiresCompatibilities,
      cpu: taskDefinition.cpu,
      memory: taskDefinition.memory,
      proxyConfiguration: taskDefinition.proxyConfiguration,
      inferenceAccelerators: taskDefinition.inferenceAccelerators,
      pidMode: taskDefinition.pidMode,
      ipcMode: taskDefinition.ipcMode,
      ephemeralStorage: taskDefinition.ephemeralStorage,
      runtimePlatform: taskDefinition.runtimePlatform,
    };
  }
}
