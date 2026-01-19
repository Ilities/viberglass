"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkerEcs = createWorkerEcs;
const aws = __importStar(require("@pulumi/aws"));
const awsx = __importStar(require("@pulumi/awsx"));
const pulumi = __importStar(require("@pulumi/pulumi"));
const path = __importStar(require("path"));
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
function createWorkerEcs(options) {
  const cpu = options.cpu ?? "2048";
  const memory = options.memory ?? "4096";
  const contextPath =
    options.contextPath ?? path.join(__dirname, "../../viberator");
  const dockerfilePath =
    options.dockerfilePath ??
    path.join(contextPath, "docker/viberator-ecs-worker.Dockerfile");
  // ECS cluster with Container Insights
  const clusterSettings = [];
  if (options.config.containerInsights) {
    clusterSettings.push({
      name: "containerInsights",
      value: "enabled",
    });
  }
  const cluster = new aws.ecs.Cluster(
    `${options.config.environment}-viberator-ecs-cluster`,
    {
      settings: clusterSettings,
      tags: options.config.tags,
    },
  );
  // Build and publish the ECS worker container image
  const ecsImage = new awsx.ecr.Image(
    `${options.config.environment}-viberator-ecs-worker-image`,
    {
      repositoryUrl: options.repositoryUrl,
      context: contextPath,
      dockerfile: dockerfilePath,
      platform: "linux/amd64",
    },
  );
  // IAM role for ECS task execution (pulls images, writes logs)
  const ecsTaskExecutionRole = new aws.iam.Role(
    `${options.config.environment}-viberator-ecs-task-exec-role`,
    {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
      }),
      tags: options.config.tags,
    },
  );
  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberator-ecs-task-exec-basic`,
    {
      role: ecsTaskExecutionRole.name,
      policyArn:
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    },
  );
  // IAM role for ECS task (for SSM access)
  const ecsTaskRole = new aws.iam.Role(
    `${options.config.environment}-viberator-ecs-task-role`,
    {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
      }),
      tags: options.config.tags,
    },
  );
  // SSM policy for tenant-aware credential access
  const ssmPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberator-ecs-ssm-policy`,
    {
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Effect: "Allow",
            Resource: `arn:aws:ssm:${options.config.awsRegion}:*:parameter/viberator/tenants/*`,
          },
        ],
      },
      tags: options.config.tags,
    },
  );
  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberator-ecs-task-ssm`,
    {
      role: ecsTaskRole.name,
      policyArn: ssmPolicy.arn,
    },
  );
  // CloudWatch log group for ECS logs
  const logGroup = new aws.cloudwatch.LogGroup(
    `${options.config.environment}-viberator-worker-logs`,
    {
      retentionInDays: 7,
      tags: options.config.tags,
    },
  );
  // Container definition for the worker
  const workerContainer = new aws.ecs.TaskDefinition(
    `${options.config.environment}-viberator-ecs-worker`,
    {
      family: `${options.config.environment}-viberator-worker`,
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
              "awslogs-group": logGroup.name,
              "awslogs-region": options.config.awsRegion,
              "awslogs-stream-prefix": "ecs",
            },
          },
          environment: [
            { name: "NODE_ENV", value: "production" },
            { name: "WORK_DIR", value: "/tmp/viberator-work" },
            { name: "TENANT_CONFIG_PATH_PREFIX", value: "/viberator/tenants" },
          ],
          secrets: [
            {
              name: "GITHUB_TOKEN",
              valueFrom: `arn:aws:ssm:${options.config.awsRegion}:::parameter/viberator/tenants/${"${tenantId}"}/GITHUB_TOKEN`,
            },
            {
              name: "CLAUDE_CODE_API_KEY",
              valueFrom: `arn:aws:ssm:${options.config.awsRegion}:::parameter/viberator/tenants/${"${tenantId}"}/CLAUDE_CODE_API_KEY`,
            },
          ],
        },
      ])}`,
      tags: options.config.tags,
    },
  );
  return {
    clusterArn: cluster.arn,
    clusterName: cluster.name,
    taskDefinitionArn: workerContainer.arn,
    taskDefinitionFamily: workerContainer.family,
    executionRoleArn: ecsTaskExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    imageUri: ecsImage.imageUri,
  };
}
//# sourceMappingURL=worker-ecs.js.map
