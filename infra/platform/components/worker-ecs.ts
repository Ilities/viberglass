import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as path from "path";
import { InfrastructureConfig } from "../config";

/**
 * ECS worker configuration options.
 */
export interface WorkerEcsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** ECR repository URL for the worker image */
  repositoryUrl: pulumi.Output<string>;
  /** CloudWatch log group name for worker logs */
  logGroupName: pulumi.Input<string>;
  /** Task CPU units (256, 512, 1024, 2048, 4096) */
  cpu?: string;
  /** Task memory in MB (512, 1024, 2048, 4096, 8192, 16384) */
  memory?: string;
  /** Path to Dockerfile for the worker image */
  dockerfilePath?: string;
  /** Build context for docker build */
  contextPath?: string;
}

/**
 * ECS worker component outputs.
 */
export interface WorkerEcsOutputs {
  /** ECS Cluster ARN */
  clusterArn: pulumi.Output<string>;
  /** ECS Cluster name */
  clusterName: pulumi.Output<string>;
  /** Task definition ARN */
  taskDefinitionArn: pulumi.Output<string>;
  /** Task definition family */
  taskDefinitionFamily: pulumi.Output<string>;
  /** Task execution role ARN */
  executionRoleArn: pulumi.Output<string>;
  /** Task role ARN */
  taskRoleArn: pulumi.Output<string>;
  /** Task role name for policy attachments */
  taskRoleName: pulumi.Output<string>;
  /** Worker container image URI */
  imageUri: pulumi.Output<string>;
}

/**
 * Creates ECS infrastructure for running worker tasks.
 *
 * This creates an ECS cluster with Fargate capacity and a task
 * definition for running worker containers. The worker has access
 * to SSM Parameter Store for tenant credentials.
 *
 * Containers are configured with CloudWatch logging and environment
 * variables for production operation.
 */
export function createWorkerEcs(options: WorkerEcsOptions): WorkerEcsOutputs {
  const cpu = options.cpu ?? "2048";
  const memory = options.memory ?? "4096";
  const contextPath = options.contextPath ?? path.join(__dirname, "../../viberator");
  const dockerfilePath = options.dockerfilePath ?? path.join(contextPath, "docker/viberator-ecs-worker.Dockerfile");

  // ECS cluster with Container Insights
  const clusterSettings: aws.types.input.ecs.ClusterSetting[] = [];
  if (options.config.containerInsights) {
    clusterSettings.push({
      name: "containerInsights",
      value: "enabled",
    } as aws.types.input.ecs.ClusterSetting);
  }

  const cluster = new aws.ecs.Cluster(`${options.config.environment}-viberglass-ecs-cluster`, {
    settings: clusterSettings,
    tags: options.config.tags,
  });

  // Build and publish the ECS worker container image
  const ecsImage = new awsx.ecr.Image(`${options.config.environment}-viberglass-ecs-worker-image`, {
    repositoryUrl: options.repositoryUrl,
    context: contextPath,
    dockerfile: dockerfilePath,
    platform: "linux/amd64",
  });

  // IAM role for ECS task execution (pulls images, writes logs)
  const ecsTaskExecutionRole = new aws.iam.Role(`${options.config.environment}-viberglass-ecs-task-exec-role`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "ecs-tasks.amazonaws.com",
    }),
    tags: options.config.tags,
  });

  new aws.iam.RolePolicyAttachment(`${options.config.environment}-viberglass-ecs-task-exec-basic`, {
    role: ecsTaskExecutionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  // IAM role for ECS task (for SSM access)
  const ecsTaskRole = new aws.iam.Role(`${options.config.environment}-viberglass-ecs-task-role`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "ecs-tasks.amazonaws.com",
    }),
    tags: options.config.tags,
  });

  // SSM policy for tenant-aware credential access
  const ssmPolicy = new aws.iam.Policy(`${options.config.environment}-viberglass-ecs-ssm-policy`, {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["ssm:GetParameter", "ssm:GetParameters"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${options.config.awsRegion}:*:parameter/viberglass/tenants/*`,
        },
      ],
    },
    tags: options.config.tags,
  });

  new aws.iam.RolePolicyAttachment(`${options.config.environment}-viberglass-ecs-task-ssm`, {
    role: ecsTaskRole.name,
    policyArn: ssmPolicy.arn,
  });

  // CloudWatch log group for ECS logs
  // Note: Log group is created centrally by logging component
  // This reference will be passed in from parent stack

  // Container definition for the worker
  const workerContainer = new aws.ecs.TaskDefinition(`${options.config.environment}-viberglass-ecs-worker`, {
    family: `${options.config.environment}-viberglass-worker`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: cpu,
    memory: memory,
    executionRoleArn: ecsTaskExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    containerDefinitions: pulumi.interpolate`${JSON.stringify([
      {
        name: "viberator-worker",
        image: ecsImage.imageUri,
        essential: true,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": options.logGroupName,
            "awslogs-region": options.config.awsRegion,
            "awslogs-stream-prefix": "worker",
          },
        },
        environment: [
          { name: "NODE_ENV", value: "production" },
          { name: "WORK_DIR", value: "/tmp/viberator-work" },
          { name: "TENANT_CONFIG_PATH_PREFIX", value: "/viberglass/tenants" },
        ],
        secrets: [
          {
            name: "GITHUB_TOKEN",
            valueFrom: `arn:aws:ssm:${options.config.awsRegion}:::parameter/viberglass/tenants/${"${tenantId}"}/GITHUB_TOKEN`,
          },
          {
            name: "CLAUDE_CODE_API_KEY",
            valueFrom: `arn:aws:ssm:${options.config.awsRegion}:::parameter/viberglass/tenants/${"${tenantId}"}/CLAUDE_CODE_API_KEY`,
          },
        ],
      },
    ])}`,
    tags: options.config.tags,
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-ecs-worker` }],
  });

  return {
    clusterArn: cluster.arn,
    clusterName: cluster.name,
    taskDefinitionArn: workerContainer.arn,
    taskDefinitionFamily: workerContainer.family,
    executionRoleArn: ecsTaskExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    taskRoleName: ecsTaskRole.name,
    imageUri: ecsImage.imageUri,
  };
}
