"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsAccessPolicyArn =
  exports.uploadsBucketArn =
  exports.uploadsBucketName =
  exports.ecsImageUri =
  exports.ecsTaskRoleArn =
  exports.ecsExecutionRoleArn =
  exports.ecsTaskDefinitionFamily =
  exports.ecsTaskDefinitionArn =
  exports.ecsClusterName =
  exports.ecsClusterArn =
  exports.lambdaImageUri =
  exports.lambdaInvokeArn =
  exports.lambdaName =
  exports.lambdaArn =
  exports.deadLetterQueueArn =
  exports.queueId =
  exports.queueArn =
  exports.queueUrl =
  exports.repositoryId =
  exports.repositoryArn =
  exports.repositoryUrl =
  exports.environment =
  exports.awsRegion =
    void 0;
const config_1 = require("./config");
const registry_1 = require("./components/registry");
const queue_1 = require("./components/queue");
const worker_lambda_1 = require("./components/worker-lambda");
const worker_ecs_1 = require("./components/worker-ecs");
const storage_1 = require("./components/storage");
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
const config = (0, config_1.getConfig)();
// Create ECR repository for container images
const registry = (0, registry_1.createRegistry)({
  config,
  forceDelete: true, // Allow cleanup in dev environments
});
// Create SQS queue with dead letter queue
const queue = (0, queue_1.createQueue)({
  config,
  visibilityTimeoutSeconds: 900, // 15 minutes for Lambda max timeout
  messageRetentionSeconds: 345600, // 4 days
  maxReceiveCount: 3,
});
// Create Lambda worker triggered by SQS
const lambdaWorker = (0, worker_lambda_1.createWorkerLambda)({
  config,
  repositoryUrl: registry.repositoryUrl,
  queue: queue,
  timeout: 900,
  memorySize: 2048,
});
// Create ECS worker for heavier workloads
const ecsWorker = (0, worker_ecs_1.createWorkerEcs)({
  config,
  repositoryUrl: registry.repositoryUrl,
  cpu: "2048",
  memory: "4096",
});
// Create S3 storage for file uploads
const storage = (0, storage_1.createStorage)({
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
  },
);
// Attach S3 access policy to ECS task role
const ecsS3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberator-ecs-s3-access`,
  {
    role: ecsWorker.taskRoleName,
    policyArn: storage.accessPolicyArn,
  },
);
// Export stack outputs
exports.awsRegion = config.awsRegion;
exports.environment = config.environment;
exports.repositoryUrl = registry.repositoryUrl;
exports.repositoryArn = registry.repositoryArn;
exports.repositoryId = registry.repositoryId;
exports.queueUrl = queue.queueUrl;
exports.queueArn = queue.queueArn;
exports.queueId = queue.queueId;
exports.deadLetterQueueArn = queue.deadLetterQueueArn;
exports.lambdaArn = lambdaWorker.lambdaArn;
exports.lambdaName = lambdaWorker.lambdaName;
exports.lambdaInvokeArn = lambdaWorker.lambdaInvokeArn;
exports.lambdaImageUri = lambdaWorker.imageUri;
exports.ecsClusterArn = ecsWorker.clusterArn;
exports.ecsClusterName = ecsWorker.clusterName;
exports.ecsTaskDefinitionArn = ecsWorker.taskDefinitionArn;
exports.ecsTaskDefinitionFamily = ecsWorker.taskDefinitionFamily;
exports.ecsExecutionRoleArn = ecsWorker.executionRoleArn;
exports.ecsTaskRoleArn = ecsWorker.taskRoleArn;
exports.ecsImageUri = ecsWorker.imageUri;
exports.uploadsBucketName = storage.bucketName;
exports.uploadsBucketArn = storage.bucketArn;
exports.uploadsAccessPolicyArn = storage.accessPolicyArn;
//# sourceMappingURL=index.js.map
