import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { getConfig, InfrastructureConfig } from "./config";
import { createRegistry, RegistryOutputs } from "./components/registry";
import { createQueue, QueueOutputs } from "./components/queue";
import { createWorkerLambda, WorkerLambdaOutputs } from "./components/worker-lambda";
import { createWorkerEcs, WorkerEcsOutputs } from "./components/worker-ecs";
import { createStorage, StorageOutputs } from "./components/storage";
import { createKmsKey, KmsOutputs } from "./components/kms";

/**
 * Viberator Infrastructure Stack
 *
 * This stack creates the AWS infrastructure for running Viberator workers:
 * - ECR repository for container images
 * - SQS queue for job processing with DLQ
 * - S3 bucket for file uploads with encryption and lifecycle policies
 * - Lambda worker for lightweight jobs
 * - ECS cluster with Fargate for heavier workloads
 *
 * Stack outputs provide endpoints and ARNs for deployment and testing.
 */

// Load configuration from Pulumi stack
const config = getConfig();

// Create ECR repository for container images
const registry: RegistryOutputs = createRegistry({
  config,
  forceDelete: true, // Allow cleanup in dev environments
});

// Create SQS queue with dead letter queue
const queue: QueueOutputs = createQueue({
  config,
  visibilityTimeoutSeconds: 900, // 15 minutes for Lambda max timeout
  messageRetentionSeconds: 345600, // 4 days
  maxReceiveCount: 3,
});

// Create Lambda worker triggered by SQS
const lambdaWorker: WorkerLambdaOutputs = createWorkerLambda({
  config,
  repositoryUrl: registry.repositoryUrl,
  queue: queue,
  timeout: 900,
  memorySize: 2048,
});

// Create ECS worker for heavier workloads
const ecsWorker: WorkerEcsOutputs = createWorkerEcs({
  config,
  repositoryUrl: registry.repositoryUrl,
  cpu: "2048",
  memory: "4096",
});

// Create S3 storage for file uploads
const storage: StorageOutputs = createStorage({
  config,
  bucketPrefix: "viberator-uploads",
  versioningEnabled: config.environment !== "dev",
});

// Attach S3 access policy to Lambda worker role
const lambdaS3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberator-lambda-s3-access`,
  {
    role: lambdaWorker.lambdaRoleName,
    policyArn: storage.accessPolicyArn,
  }
);

// Attach S3 access policy to ECS task role
const ecsS3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberator-ecs-s3-access`,
  {
    role: ecsWorker.taskRoleName,
    policyArn: storage.accessPolicyArn,
  }
);

// Export stack outputs
export const awsRegion = config.awsRegion;
export const environment = config.environment;

export const repositoryUrl = registry.repositoryUrl;
export const repositoryArn = registry.repositoryArn;
export const repositoryId = registry.repositoryId;

export const queueUrl = queue.queueUrl;
export const queueArn = queue.queueArn;
export const queueId = queue.queueId;
export const deadLetterQueueArn = queue.deadLetterQueueArn;

export const lambdaArn = lambdaWorker.lambdaArn;
export const lambdaName = lambdaWorker.lambdaName;
export const lambdaInvokeArn = lambdaWorker.lambdaInvokeArn;
export const lambdaImageUri = lambdaWorker.imageUri;

export const ecsClusterArn = ecsWorker.clusterArn;
export const ecsClusterName = ecsWorker.clusterName;
export const ecsTaskDefinitionArn = ecsWorker.taskDefinitionArn;
export const ecsTaskDefinitionFamily = ecsWorker.taskDefinitionFamily;
export const ecsExecutionRoleArn = ecsWorker.executionRoleArn;
export const ecsTaskRoleArn = ecsWorker.taskRoleArn;
export const ecsImageUri = ecsWorker.imageUri;

export const uploadsBucketName = storage.bucketName;
export const uploadsBucketArn = storage.bucketArn;
export const uploadsAccessPolicyArn = storage.accessPolicyArn;
