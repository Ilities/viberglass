import type {
  RegisterTaskDefinitionCommandInput,
  TaskDefinition,
} from "@aws-sdk/client-ecs";
import type { Clanker } from "@viberglass/types";
import type { EcsProvisioningConfig, EcsTaskDefinitionDetails } from "./ecsTypes";

export function mapTaskDefinitionDetails(
  taskDefinition: TaskDefinition | null,
): EcsTaskDefinitionDetails {
  if (!taskDefinition) {
    return {};
  }

  return {
    taskDefinitionArn: taskDefinition.taskDefinitionArn,
    family: taskDefinition.family,
    revision: taskDefinition.revision,
    status: taskDefinition.status,
    registeredAt: taskDefinition.registeredAt
      ? new Date(taskDefinition.registeredAt).toISOString()
      : undefined,
    registeredBy: taskDefinition.registeredBy,
    networkMode: taskDefinition.networkMode,
    cpu: taskDefinition.cpu,
    memory: taskDefinition.memory,
    requiresCompatibilities: taskDefinition.requiresCompatibilities,
    containerImages:
      taskDefinition.containerDefinitions?.map((container) => ({
        name: container.name,
        image: container.image,
      })) || [],
  };
}

export function buildEcsFamilyName(clanker: Clanker): string {
  const base = clanker.slug || clanker.id;
  return `viberator-worker-${base}`.slice(0, 255);
}

export function buildDefaultTaskDefinition(
  clanker: Clanker,
  config: EcsProvisioningConfig,
): RegisterTaskDefinitionCommandInput {
  const executionRoleArn =
    config.executionRoleArn || process.env.VIBERATOR_ECS_EXECUTION_ROLE_ARN;
  const taskRoleArn =
    config.taskRoleArn || process.env.VIBERATOR_ECS_TASK_ROLE_ARN;
  const containerImage =
    config.containerImage || process.env.VIBERATOR_ECS_CONTAINER_IMAGE;
  const logGroup =
    config.logGroup ||
    process.env.VIBERATOR_ECS_LOG_GROUP ||
    "/ecs/viberator-worker";
  const region = config.region || process.env.AWS_REGION || "eu-west-1";

  if (!executionRoleArn || !taskRoleArn || !containerImage) {
    throw new Error(
      "ECS task definition requires executionRoleArn, taskRoleArn, and containerImage",
    );
  }

  return {
    family: config.family || buildEcsFamilyName(clanker),
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: config.cpu || process.env.VIBERATOR_ECS_CPU || "1024",
    memory: config.memory || process.env.VIBERATOR_ECS_MEMORY || "2048",
    executionRoleArn,
    taskRoleArn,
    containerDefinitions: [
      {
        name: config.containerName || "worker",
        image: containerImage,
        essential: true,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroup,
            "awslogs-region": region,
            "awslogs-stream-prefix": config.logStreamPrefix || "ecs",
          },
        },
      },
    ],
  };
}
