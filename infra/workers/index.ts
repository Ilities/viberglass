import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as path from "path";
import { getConfig } from "./config";

/**
 * Viberglass Workers Infrastructure Stack
 *
 * This stack creates the worker infrastructure:
 * - ECR repository for worker container images
 * - SQS queue with dead letter queue
 * - Lambda worker for lightweight jobs
 * - ECS cluster with Fargate for heavier workloads
 *
 * This stack depends on the base stack for:
 * - VPC with subnets and security groups
 * - KMS key for SSM encryption
 * - CloudWatch log groups
 *
 * Stack outputs provide endpoints and ARNs for deployment and testing.
 */

// Load configuration from Pulumi stack
const config = getConfig();

// =============================================================================
// BASE STACK REFERENCE
// =============================================================================

// Reference the base stack for shared infrastructure
const baseStack = new pulumi.StackReference(config.baseStack);

// Get outputs from base stack
const publicSubnetIds = baseStack.getOutput("publicSubnetIds") as pulumi.Output<
  string[]
>;
const privateSubnetIds = baseStack.getOutput(
  "privateSubnetIds",
) as pulumi.Output<string[]>;
const workerSecurityGroupId = baseStack.getOutput(
  "workerSecurityGroupId",
) as pulumi.Output<string>;
const kmsKeyArn = baseStack.getOutput("kmsKeyArn") as pulumi.Output<string>;
const lambdaLogGroupName = baseStack.getOutput(
  "lambdaLogGroupName",
) as pulumi.Output<string>;
const ecsWorkerLogGroupName = baseStack.getOutput(
  "ecsWorkerLogGroupName",
) as pulumi.Output<string>;
const baseNetworkMode = baseStack.getOutput("networkMode") as pulumi.Output<
  string | undefined
>;
const networkMode = baseNetworkMode.apply((mode) => mode ?? "enterprise");
const workerSubnetIds = pulumi
  .all([privateSubnetIds, publicSubnetIds, networkMode])
  .apply(([privateIds, publicIds, mode]) =>
    mode === "enterprise" ? privateIds : publicIds,
  );
const workerAssignPublicIp = networkMode.apply((mode) => mode !== "enterprise");

// =============================================================================
// ECR REPOSITORY
// =============================================================================

// Create ECR repository for worker container images
const workerRepo = new awsx.ecr.Repository(
  `${config.environment}-viberglass-worker-repo`,
  {
    forceDelete: true, // Allow cleanup in dev environments
    tags: config.tags,
  },
);

// =============================================================================
// SQS QUEUE
// =============================================================================

// Create dead letter queue for failed messages
const deadLetterQueue = new aws.sqs.Queue(
  `${config.environment}-viberglass-worker-dlq`,
  {
    visibilityTimeoutSeconds: 900, // 15 minutes
    messageRetentionSeconds: 345600, // 4 days
    tags: config.tags,
  },
);

// Create main worker queue with redrive policy for DLQ
const workerQueue = new aws.sqs.Queue(
  `${config.environment}-viberglass-worker-queue`,
  {
    visibilityTimeoutSeconds: 900, // 15 minutes for Lambda max timeout
    messageRetentionSeconds: 345600, // 4 days
    redrivePolicy: deadLetterQueue.arn.apply((arn) =>
      JSON.stringify({
        deadLetterTargetArn: arn,
        maxReceiveCount: 3,
      }),
    ),
    tags: config.tags,
  },
);

// =============================================================================
// LAMBDA WORKER
// =============================================================================

// Build paths for Lambda worker image
const contextPath = path.join(__dirname, "../../viberator");
const lambdaDockerfilePath = path.join(
  contextPath,
  "docker/viberator-lambda.Dockerfile",
);

// Build and publish the Lambda container image to ECR
const lambdaImage = new awsx.ecr.Image(
  `${config.environment}-viberglass-worker-image`,
  {
    repositoryUrl: workerRepo.url,
    context: contextPath,
    dockerfile: lambdaDockerfilePath,
    platform: "linux/amd64",
  },
);

// IAM role for Lambda
const lambdaRole = new aws.iam.Role(
  `${config.environment}-viberglass-lambda-role`,
  {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "lambda.amazonaws.com",
    }),
    tags: config.tags,
  },
);

// Attach basic execution role policy
new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-lambda-basic-exec`,
  {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  },
);

// Attach SQS execution role policy
new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-lambda-sqs-exec`,
  {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaSQSQueueExecutionRole,
  },
);

// SSM policy for tenant-aware credential access
const lambdaSsmPolicy = new aws.iam.Policy(
  `${config.environment}-viberglass-lambda-ssm-policy`,
  {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["ssm:GetParameter", "ssm:GetParameters"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${config.awsRegion}:*:parameter/viberglass/tenants/*`,
        },
      ],
    },
    tags: config.tags,
  },
);

new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-lambda-ssm`,
  {
    role: lambdaRole.name,
    policyArn: lambdaSsmPolicy.arn,
  },
);

// KMS decrypt permission for Lambda
new aws.iam.RolePolicy(`${config.environment}-viberglass-lambda-kms`, {
  role: lambdaRole.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kmsKeyArn}"
    }]
  }`,
});

// Create the Lambda function
const workerLambda = new aws.lambda.Function(
  `${config.environment}-viberglass-worker`,
  {
    name: `viberglass-${config.environment}-worker`,
    packageType: "Image",
    imageUri: lambdaImage.imageUri,
    role: lambdaRole.arn,
    timeout: 900, // 15 minutes (max Lambda timeout)
    memorySize: 2048,
    environment: {
      variables: {
        HOME: "/tmp",
        NODE_ENV: "production",
        LOG_FORMAT: "json",
        CLAUDE_CONFIG_DIR: "/tmp/config",
        TENANT_CONFIG_PATH_PREFIX: "/viberglass/tenants",
      },
    },
    tags: config.tags,
  },
);

// Trigger Lambda from SQS
const eventSourceMapping = new aws.lambda.EventSourceMapping(
  `${config.environment}-viberglass-sqs-trigger`,
  {
    eventSourceArn: workerQueue.arn,
    functionName: workerLambda.name,
    batchSize: 1,
  },
);

// =============================================================================
// ECS WORKER CLUSTER
// =============================================================================

// ECS cluster with Container Insights
const clusterSettings: aws.types.input.ecs.ClusterSetting[] = [];
if (config.containerInsights) {
  clusterSettings.push({
    name: "containerInsights",
    value: "enabled",
  } as aws.types.input.ecs.ClusterSetting);
}

const workerCluster = new aws.ecs.Cluster(
  `${config.environment}-viberglass-worker-cluster`,
  {
    settings: clusterSettings,
    tags: config.tags,
  },
);

// Build paths for ECS worker image
const ecsDockerfilePath = path.join(
  contextPath,
  "docker/viberator-ecs-worker.Dockerfile",
);

// Build and publish the ECS worker container image
const ecsImage = new awsx.ecr.Image(
  `${config.environment}-viberglass-ecs-worker-image`,
  {
    repositoryUrl: workerRepo.url,
    context: contextPath,
    dockerfile: ecsDockerfilePath,
    platform: "linux/amd64",
  },
);

// IAM role for ECS task execution (pulls images, writes logs)
const ecsTaskExecutionRole = new aws.iam.Role(
  `${config.environment}-viberglass-ecs-task-exec-role`,
  {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "ecs-tasks.amazonaws.com",
    }),
    tags: config.tags,
  },
);

new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-ecs-task-exec-basic`,
  {
    role: ecsTaskExecutionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  },
);

// IAM role for ECS task (for SSM access)
const ecsTaskRole = new aws.iam.Role(
  `${config.environment}-viberglass-ecs-task-role`,
  {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "ecs-tasks.amazonaws.com",
    }),
    tags: config.tags,
  },
);

// SSM policy for tenant-aware credential access
const ecsSsmPolicy = new aws.iam.Policy(
  `${config.environment}-viberglass-ecs-ssm-policy`,
  {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["ssm:GetParameter", "ssm:GetParameters"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${config.awsRegion}:*:parameter/viberglass/tenants/*`,
        },
      ],
    },
    tags: config.tags,
  },
);

new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-ecs-task-ssm`,
  {
    role: ecsTaskRole.name,
    policyArn: ecsSsmPolicy.arn,
  },
);

// KMS decrypt permission for ECS task
new aws.iam.RolePolicy(`${config.environment}-viberglass-ecs-kms`, {
  role: ecsTaskRole.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kmsKeyArn}"
    }]
  }`,
});

// ECS task definition for workers
const workerTaskDefinition = new aws.ecs.TaskDefinition(
  `${config.environment}-viberglass-ecs-worker`,
  {
    family: `${config.environment}-viberglass-worker`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "2048",
    memory: "4096",
    executionRoleArn: ecsTaskExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    containerDefinitions: pulumi
      .all([ecsImage.imageUri, ecsWorkerLogGroupName])
      .apply(([imageUri, logGroupName]) =>
        JSON.stringify([
          {
            name: "viberator-worker",
            image: imageUri,
            essential: true,
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": logGroupName,
                "awslogs-region": config.awsRegion,
                "awslogs-stream-prefix": "worker",
              },
            },
            environment: [
              { name: "NODE_ENV", value: "production" },
              { name: "WORK_DIR", value: "/tmp/viberator-work" },
              {
                name: "TENANT_CONFIG_PATH_PREFIX",
                value: "/viberglass/tenants",
              },
            ],
          },
        ]),
      ),
    tags: config.tags,
  },
);

// =============================================================================
// STACK EXPORTS
// =============================================================================

// Environment info
export const awsRegion = config.awsRegion;
export const environment = config.environment;

// Base stack reference
export const baseStackName = config.baseStack;

// ECR outputs
export const workerRepositoryUrl = workerRepo.url;
export const workerRepositoryArn = workerRepo.repository.arn;
export const workerRepositoryId = workerRepo.repository.id;

// SQS outputs
export const queueUrl = workerQueue.url;
export const queueArn = workerQueue.arn;
export const queueId = workerQueue.id;
export const deadLetterQueueArn = deadLetterQueue.arn;
export const deadLetterQueueUrl = deadLetterQueue.url;

// Lambda outputs
export const lambdaArn = workerLambda.arn;
export const lambdaName = workerLambda.name;
export const lambdaInvokeArn = workerLambda.invokeArn;
export const lambdaImageUri = lambdaImage.imageUri;
export const lambdaRoleName = lambdaRole.name;
export const lambdaRoleArn = lambdaRole.arn;
export const eventSourceMappingId = eventSourceMapping.id;

// ECS outputs
export const ecsClusterArn = workerCluster.arn;
export const ecsClusterName = workerCluster.name;
export const ecsTaskDefinitionArn = workerTaskDefinition.arn;
export const ecsTaskDefinitionFamily = workerTaskDefinition.family;
export const ecsExecutionRoleArn = ecsTaskExecutionRole.arn;
export const ecsTaskRoleArn = ecsTaskRole.arn;
export const ecsTaskRoleName = ecsTaskRole.name;
export const ecsImageUri = ecsImage.imageUri;

// Security group (from base stack, exported for convenience)
export const workerSecurityGroup = workerSecurityGroupId;
export const privateSubnets = privateSubnetIds;
export const publicSubnets = publicSubnetIds;
export const workerSubnets = workerSubnetIds;
export { workerAssignPublicIp };
