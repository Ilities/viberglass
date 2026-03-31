import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * Backend ECS configuration options.
 */
export interface BackendEcsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** ECR repository URL for the backend image */
  repositoryUrl: pulumi.Output<string>;
  /** CloudWatch log group name for backend logs */
  logGroupName: pulumi.Input<string>;
  /** Target group ARN from load balancer */
  targetGroupArn: pulumi.Input<string>;
  /** VPC subnet IDs for ECS tasks */
  subnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /** Backend security group ID */
  backendSecurityGroupId: pulumi.Input<string>;
  /** ALB security group ID for allowing traffic */
  albSecurityGroupId: pulumi.Input<string>;
  /** Assign public IPs to tasks (required for public subnets) */
  assignPublicIp?: pulumi.Input<boolean>;
  /** Database SSM parameter paths */
  databaseSsm: {
    urlPathArn: pulumi.Input<string>;
    hostPathArn: pulumi.Input<string>;
  };
  /** Webhook encryption key SSM parameter ARN */
  webhookSecretEncryptionKeySsmArn: pulumi.Input<string>;
  /** Slack integration SSM parameter ARNs (optional) */
  slackSsm?: {
    signingSecretArn: pulumi.Input<string>;
    botTokenArn: pulumi.Input<string>;
  };
  /** Task CPU units (256, 512, 1024, 2048, 4096) */
  cpu?: string;
  /** Task memory in MB (512, 1024, 2048, 4096, 8192, 16384) */
  memory?: string;
  /** Container port (default: 3000) */
  containerPort?: number;
  /** Desired task count */
  desiredCount?: number;
  /** Minimum task count for auto-scaling */
  minTasks?: number;
  /** Maximum task count for auto-scaling */
  maxTasks?: number;
  /** Image tag used when constructing backend image URI from repository URL */
  imageTag?: pulumi.Input<string>;
  /** Allowed CORS origins (comma-separated). Defaults to localhost for development. */
  allowedOrigins?: pulumi.Input<string>;
  /** Platform API URL for worker callbacks (e.g., "https://api.viberglass.io") */
  platformApiUrl?: pulumi.Input<string>;
  /** S3 bucket used for uploaded assets and ticket media */
  uploadsBucketName?: pulumi.Input<string>;
  /** S3 key prefix for ticket media objects */
  ticketMediaS3Prefix?: pulumi.Input<string>;
  /** Worker infrastructure values for clanker ECS provisioning (optional) */
  worker?: {
    executionRoleArn?: pulumi.Input<string>;
    taskRoleArn?: pulumi.Input<string>;
    imageUri?: pulumi.Input<string>;
    lambdaImageUri?: pulumi.Input<string>;
    lambdaRoleArn?: pulumi.Input<string>;
    clusterArn?: pulumi.Input<string>;
    subnetIds?: pulumi.Input<string[]>;
    securityGroupId?: pulumi.Input<string>;
    logGroupName?: pulumi.Input<string>;
  };
}

/**
 * Backend ECS component outputs.
 */
export interface BackendEcsOutputs {
  /** ECS service ARN */
  serviceArn: pulumi.Output<string>;
  /** ECS service name */
  serviceName: pulumi.Output<string>;
  /** Task definition ARN */
  taskDefinitionArn: pulumi.Output<string>;
  /** Task definition family */
  taskDefinitionFamily: pulumi.Output<string>;
  /** Task execution role ARN */
  executionRoleArn: pulumi.Output<string>;
  /** Task execution role name for policy attachments */
  executionRoleName: pulumi.Output<string>;
  /** Task role ARN */
  taskRoleArn: pulumi.Output<string>;
  /** Task role name for policy attachments */
  taskRoleName: pulumi.Output<string>;
  /** Backend container image URI */
  imageUri: pulumi.Output<string>;
}

/**
 * Creates ECS infrastructure for running the backend API.
 *
 * This creates:
 * - IAM roles for task execution and task permissions
 * - Task definition with container configuration
 * - ECS service with load balancer integration
 *
 * Containers are configured with CloudWatch logging and environment
 * variables for production operation. Database credentials are sourced
 * from SSM Parameter Store.
 */
export function createBackendEcs(
  options: BackendEcsOptions,
): BackendEcsOutputs {
  const cpu = options.cpu ?? "256";
  const memory = options.memory ?? "512";
  const containerPort = options.containerPort ?? 3000;
  const defaultImageTag =
    options.config.environment === "prod" ? "prod-latest" : "latest";
  const imageTag = options.imageTag ?? defaultImageTag;
  const backendImageUri = pulumi.interpolate`${options.repositoryUrl}:${imageTag}`;

  // IAM role for ECS task execution (pulls images, writes logs)
  const backendTaskExecutionRole = new aws.iam.Role(
    `${options.config.environment}-viberglass-backend-task-exec-role`,
    {
      name: `${options.config.environment}-viberglass-backend-task-exec-role`,
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
      }),
      tags: options.config.tags,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberglass-backend-task-exec-basic`,
    {
      role: backendTaskExecutionRole.name,
      policyArn:
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    },
  );

  // IAM role for backend task (for SSM, S3, KMS access)
  const backendTaskRole = new aws.iam.Role(
    `${options.config.environment}-viberglass-backend-task-role`,
    {
      name: `${options.config.environment}-viberglass-backend-task-role`,
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
      }),
      tags: options.config.tags,
    },
  );

  // SSM policy for database credentials and secrets management
  const ssmPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberglass-backend-ssm-policy`,
    {
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Effect: "Allow",
            Resource: [
              options.databaseSsm.urlPathArn,
              options.databaseSsm.hostPathArn,
              options.webhookSecretEncryptionKeySsmArn,
              ...(options.slackSsm
                ? [
                    options.slackSsm.signingSecretArn,
                    options.slackSsm.botTokenArn,
                  ]
                : []),
            ],
          },
          {
            Action: [
              "ssm:PutParameter",
              "ssm:GetParameter",
              "ssm:DeleteParameter",
            ],
            Effect: "Allow",
            Resource: `arn:aws:ssm:${options.config.awsRegion}:*:parameter/viberator/secrets/*`,
          },
        ],
      },
      tags: options.config.tags,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberglass-backend-task-ssm`,
    {
      role: backendTaskRole.name,
      policyArn: ssmPolicy.arn,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberglass-backend-task-exec-ssm`,
    {
      role: backendTaskExecutionRole.name,
      policyArn: ssmPolicy.arn,
    },
  );

  // CloudWatch Logs policy
  const logsPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberglass-backend-logs-policy`,
    {
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Effect: "Allow",
            Resource: `arn:aws:logs:${options.config.awsRegion}:*:log-group${options.logGroupName}`,
          },
        ],
      },
      tags: options.config.tags,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberglass-backend-task-logs`,
    {
      role: backendTaskRole.name,
      policyArn: logsPolicy.arn,
    },
  );

  // ECS Execute Command policy (for debugging)
  new aws.iam.RolePolicy(
    `${options.config.environment}-viberglass-backend-exec-command`,
    {
      role: backendTaskRole.name,
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "ssmmessages:CreateControlChannel",
              "ssmmessages:CreateDataChannel",
              "ssmmessages:OpenControlChannel",
              "ssmmessages:OpenDataChannel",
            ],
            Resource: "*",
          },
        ],
      },
    },
  );

  // ECS Worker Management policy (for Clanker dynamic task provisioning)
  new aws.iam.RolePolicy(
    `${options.config.environment}-viberglass-backend-ecs-worker`,
    {
      role: backendTaskRole.name,
      policy: pulumi
        .all([
          options.worker?.executionRoleArn ?? "",
          options.worker?.taskRoleArn ?? "",
        ])
        .apply(([execRoleArn, taskRoleArn]) => {
          const passRoleResources: string[] = [];
          if (execRoleArn) passRoleResources.push(execRoleArn);
          if (taskRoleArn) passRoleResources.push(taskRoleArn);

          const statements: any[] = [
            {
              Effect: "Allow",
              Action: [
                "ecs:RegisterTaskDefinition",
                "ecs:DeregisterTaskDefinition",
                "ecs:DescribeTaskDefinition",
                "ecs:ListTaskDefinitions",
                "ecs:RunTask",
                "ecs:StopTask",
                "ecs:DescribeTasks",
                "ecs:ListTasks",
              ],
              Resource: "*",
            },
          ];

          // Only add PassRole statement if worker roles are provided
          if (passRoleResources.length > 0) {
            statements.push({
              Effect: "Allow",
              Action: "iam:PassRole",
              Resource: passRoleResources,
              Condition: {
                StringEquals: {
                  "iam:PassedToService": "ecs-tasks.amazonaws.com",
                },
              },
            });
          }

          return JSON.stringify({
            Version: "2012-10-17",
            Statement: statements,
          });
        }),
    },
  );

  // Lambda Worker Management policy (for Clanker Lambda provisioning)
  new aws.iam.RolePolicy(
    `${options.config.environment}-viberglass-backend-lambda-worker`,
    {
      role: backendTaskRole.name,
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "lambda:GetFunction",
              "lambda:GetFunctionConfiguration",
              "lambda:CreateFunction",
              "lambda:UpdateFunctionCode",
              "lambda:UpdateFunctionConfiguration",
              "lambda:DeleteFunction",
              "lambda:InvokeFunction",
            ],
            Resource: [
              `arn:aws:lambda:${options.config.awsRegion}:*:function:viberator-*`,
              `arn:aws:lambda:${options.config.awsRegion}:*:function:viberator-*:*`,
            ],
          },
          {
            Effect: "Allow",
            Action: ["iam:PassRole"],
            Resource: "*",
            Condition: {
              StringEquals: {
                "iam:PassedToService": "lambda.amazonaws.com",
              },
            },
          },
        ],
      },
    },
  );

  // Backend task definition
  const backendTaskDefinition = new aws.ecs.TaskDefinition(
    `${options.config.environment}-viberglass-backend`,
    {
      family: `${options.config.environment}-viberglass-backend`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: cpu,
      memory: memory,
      executionRoleArn: backendTaskExecutionRole.arn,
      taskRoleArn: backendTaskRole.arn,
      containerDefinitions: pulumi
        .all({
          imageUri: backendImageUri,
          logGroupName: options.logGroupName,
          databaseUrlPath: options.databaseSsm.urlPathArn,
          webhookSecretEncryptionKeyPath:
            options.webhookSecretEncryptionKeySsmArn,
          allowedOrigins: options.allowedOrigins ?? "http://localhost:3000",
          platformApiUrl: options.platformApiUrl ?? "",
          workerExecRole: options.worker?.executionRoleArn ?? "",
          workerTaskRole: options.worker?.taskRoleArn ?? "",
          workerImage: options.worker?.imageUri ?? "",
          workerLambdaImage: options.worker?.lambdaImageUri ?? "",
          workerLambdaRole: options.worker?.lambdaRoleArn ?? "",
          workerCluster: options.worker?.clusterArn ?? "",
          workerSubnets: options.worker?.subnetIds ?? [],
          workerSecurityGroup: options.worker?.securityGroupId ?? "",
          workerLogGroup: options.worker?.logGroupName ?? "",
          uploadsBucketName: options.uploadsBucketName ?? "",
          ticketMediaS3Prefix: options.ticketMediaS3Prefix ?? "ticket-media",
          slackSigningSecretPath: options.slackSsm?.signingSecretArn ?? "",
          slackBotTokenPath: options.slackSsm?.botTokenArn ?? "",
        })
        .apply(
          ({
            imageUri,
            logGroupName,
            databaseUrlPath,
            webhookSecretEncryptionKeyPath,
            allowedOrigins,
            platformApiUrl,
            workerExecRole,
            workerTaskRole,
            workerImage,
            workerLambdaImage,
            workerLambdaRole,
            workerCluster,
            workerSubnets,
            workerSecurityGroup,
            workerLogGroup,
            uploadsBucketName,
            ticketMediaS3Prefix,
            slackSigningSecretPath,
            slackBotTokenPath,
          }) => {
            const normalizedWorkerImage = Array.isArray(workerImage)
              ? workerImage[0]
              : workerImage;
            const normalizedWorkerSubnets = Array.isArray(workerSubnets)
              ? workerSubnets
              : [];
            const normalizedWorkerLambdaImage = Array.isArray(workerLambdaImage)
              ? workerLambdaImage[0]
              : workerLambdaImage;

            const envVars = [
              { name: "NODE_ENV", value: "production" },
              { name: "PORT", value: containerPort.toString() },
              { name: "AWS_REGION", value: options.config.awsRegion },
              { name: "DB_SSL", value: "true" },
              { name: "RUN_MIGRATIONS_ON_STARTUP", value: "true" },
              {
                name: "ALLOWED_ORIGINS",
                value: allowedOrigins,
              },
            ];

            // Add platform API URL for worker callbacks (SEC-05)
            if (platformApiUrl) {
              envVars.push({
                name: "PLATFORM_API_URL",
                value: platformApiUrl,
              });
            }

            if (uploadsBucketName) {
              envVars.push({
                name: "AWS_S3_BUCKET",
                value: uploadsBucketName,
              });
            }

            if (ticketMediaS3Prefix) {
              envVars.push({
                name: "TICKET_MEDIA_S3_PREFIX",
                value: ticketMediaS3Prefix,
              });
            }

            // Add worker environment variables if provided
            if (workerExecRole) {
              envVars.push({
                name: "VIBERATOR_ECS_EXECUTION_ROLE_ARN",
                value: workerExecRole,
              });
            }
            if (workerTaskRole) {
              envVars.push({
                name: "VIBERATOR_ECS_TASK_ROLE_ARN",
                value: workerTaskRole,
              });
            }
            if (workerImage) {
              envVars.push({
                name: "VIBERATOR_ECS_CONTAINER_IMAGE",
                value: normalizedWorkerImage,
              });

              // Extract ECR registry from image URI for auto-selecting worker images
              // Example: "123456.dkr.ecr.region.amazonaws.com/repo:tag" -> "123456.dkr.ecr.region.amazonaws.com"
              const registryMatch = normalizedWorkerImage.match(
                /^([^\/]+\.dkr\.ecr\.[^\/]+\.amazonaws\.com)/,
              );
              if (registryMatch) {
                envVars.push({
                  name: "VIBERATOR_WORKER_REGISTRY",
                  value: registryMatch[1],
                });
              }
            }
            if (workerLambdaImage) {
              envVars.push({
                name: "VIBERATOR_LAMBDA_IMAGE_URI",
                value: normalizedWorkerLambdaImage,
              });
            }
            if (workerLambdaRole) {
              envVars.push({
                name: "VIBERATOR_LAMBDA_ROLE_ARN",
                value: workerLambdaRole,
              });
            }
            if (workerCluster) {
              envVars.push({
                name: "VIBERATOR_ECS_CLUSTER_ARN",
                value: workerCluster,
              });
            }
            if (normalizedWorkerSubnets.length > 0) {
              envVars.push({
                name: "VIBERATOR_ECS_SUBNET_IDS",
                value: normalizedWorkerSubnets.join(","),
              });
            }
            if (workerSecurityGroup) {
              envVars.push({
                name: "VIBERATOR_ECS_SECURITY_GROUP_IDS",
                value: workerSecurityGroup,
              });
            }
            if (workerLogGroup) {
              envVars.push({
                name: "VIBERATOR_ECS_LOG_GROUP",
                value: workerLogGroup,
              });
            }

            return JSON.stringify([
              {
                name: "viberglass-backend",
                image: imageUri,
                essential: true,
                portMappings: [
                  {
                    containerPort: containerPort,
                    protocol: "tcp",
                  },
                ],
                logConfiguration: {
                  logDriver: "awslogs",
                  options: {
                    "awslogs-group": logGroupName,
                    "awslogs-region": options.config.awsRegion,
                    "awslogs-stream-prefix": "backend",
                  },
                },
                environment: envVars,
                secrets: [
                  {
                    name: "DATABASE_URL",
                    valueFrom: databaseUrlPath,
                  },
                  {
                    name: "WEBHOOK_SECRET_ENCRYPTION_KEY",
                    valueFrom: webhookSecretEncryptionKeyPath,
                  },
                  ...(slackSigningSecretPath
                    ? [{ name: "SLACK_SIGNING_SECRET", valueFrom: slackSigningSecretPath }]
                    : []),
                  ...(slackBotTokenPath
                    ? [{ name: "SLACK_BOT_TOKEN", valueFrom: slackBotTokenPath }]
                    : []),
                ],
                healthCheck: {
                  command: [
                    "CMD-SHELL",
                    `curl -f http://localhost:${containerPort}/health || exit 1`,
                  ],
                  interval: 30,
                  timeout: 5,
                  retries: 3,
                  startPeriod: 60,
                },
              },
            ]);
          },
        ),
      tags: options.config.tags,
    },
    {
      aliases: [{ name: `${options.config.environment}-viberator-backend` }],
    },
  );

  return {
    taskDefinitionArn: backendTaskDefinition.arn,
    taskDefinitionFamily: backendTaskDefinition.family,
    executionRoleArn: backendTaskExecutionRole.arn,
    executionRoleName: backendTaskExecutionRole.name,
    taskRoleArn: backendTaskRole.arn,
    taskRoleName: backendTaskRole.name,
    imageUri: backendImageUri,
    serviceArn: pulumi.output(""),
    serviceName: pulumi.output(""),
  };
}

/**
 * Creates the ECS service for backend API.
 *
 * This should be called after createBackendEcs with the task definition
 * outputs. Separated to allow for proper dependency ordering when wiring
 * components together.
 */
export function createBackendService(
  options: BackendEcsOptions & {
    taskDefinitionArn: pulumi.Input<string>;
    clusterArn: pulumi.Input<string>;
    clusterName: pulumi.Input<string>;
  },
): Pick<BackendEcsOutputs, "serviceArn" | "serviceName"> {
  const desiredCount = options.desiredCount ?? 1;
  const containerPort = options.containerPort ?? 3000;

  // ECS Service
  const backendService = new aws.ecs.Service(
    `${options.config.environment}-viberglass-backend-service`,
    {
      name: `${options.config.environment}-viberglass-backend`,
      cluster: options.clusterArn,
      taskDefinition: options.taskDefinitionArn,
      desiredCount: desiredCount,
      launchType: "FARGATE",
      forceNewDeployment: true,
      networkConfiguration: {
        subnets: options.subnetIds,
        securityGroups: [options.backendSecurityGroupId],
        assignPublicIp: options.assignPublicIp ?? false,
      },
      loadBalancers: [
        {
          targetGroupArn: options.targetGroupArn,
          containerName: "viberglass-backend",
          containerPort: containerPort,
        },
      ],
      enableExecuteCommand: true,
      tags: options.config.tags,
    },
    {
      // Backend deploy workflows update the service to CI-registered task definitions.
      // Ignore taskDefinition drift so Pulumi doesn't roll back those updates.
      ignoreChanges: ["taskDefinition"],
    },
  );

  return {
    serviceArn: backendService.id,
    serviceName: backendService.name,
  };
}
