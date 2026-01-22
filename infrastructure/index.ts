import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { getConfig, InfrastructureConfig } from "./config";
import { createRegistry, RegistryOutputs } from "./components/registry";
import { createQueue, QueueOutputs } from "./components/queue";
import { createWorkerLambda, WorkerLambdaOutputs } from "./components/worker-lambda";
import { createWorkerEcs, WorkerEcsOutputs } from "./components/worker-ecs";
import { createStorage, StorageOutputs } from "./components/storage";
import { createKmsKey, KmsOutputs } from "./components/kms";
import { createVpc, VpcOutputs } from "./components/vpc";
import { createDatabase, DatabaseOutputs } from "./components/database";

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

// Create VPC with public/private subnets, NAT gateways, and security groups
const vpc: VpcOutputs = createVpc(`${config.environment}-viberator`, {
  environment: config.environment,
  singleNatGateway: config.singleNatGateway ?? true,
});

// Create KMS key for SSM Parameter Store encryption
const kms: KmsOutputs = createKmsKey({
  config,
});

// Create RDS PostgreSQL database with SSM credentials storage
// Uses KMS key for encrypting SecureString parameters
const database: DatabaseOutputs = createDatabase({
  config,
  vpc: {
    privateSubnetIds: vpc.privateSubnetIds,
    rdsSecurityGroupId: vpc.rdsSecurityGroupId,
  },
  kmsKeyArn: kms.keyArn,
  instanceClass: config.dbInstanceClass,
  allocatedStorage: config.dbAllocatedStorage,
});

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

// Attach KMS decrypt permission to Lambda worker role
new aws.iam.RolePolicy(`${config.environment}-viberator-lambda-kms`, {
  role: lambdaWorker.lambdaRoleName,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kms.keyArn}"
    }]
  }`,
});

// Attach KMS decrypt permission to ECS task role
new aws.iam.RolePolicy(`${config.environment}-viberator-ecs-kms`, {
  role: ecsWorker.taskRoleName,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kms.keyArn}"
    }]
  }`,
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

// VPC outputs
export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;
export const backendSecurityGroupId = vpc.backendSecurityGroupId;
export const rdsSecurityGroupId = vpc.rdsSecurityGroupId;
export const workerSecurityGroupId = vpc.workerSecurityGroupId;

// Database outputs
export const databaseEndpoint = database.endpoint;
export const databasePort = database.port;
export const databaseInstanceArn = database.instanceArn;
export const databaseName = database.databaseName;
export const databaseSsmUsernamePath = database.usernamePath;
export const databaseSsmPasswordPath = database.passwordPath;
export const databaseSsmUrlPath = database.urlPath;
export const databaseSsmHostPath = database.hostPath;

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

// KMS outputs
export const kmsKeyId = kms.keyId;
export const kmsKeyArn = kms.keyArn;
export const kmsAliasName = kms.aliasName;
