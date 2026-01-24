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
import { createLogging, LoggingOutputs } from "./components/logging";
import { createLoadBalancer, LoadBalancerOutputs } from "./components/load-balancer";
import { createBackendEcs, createBackendService, BackendEcsOutputs } from "./components/backend-ecs";
import { createAmplifyOidc, AmplifyOidcOutputs } from "./components/amplify-oidc";
import { createAmplifyFrontend, AmplifyFrontendOutputs } from "./components/amplify-frontend";
import { createDeploymentSecrets, DeploymentSecretsOutputs } from "./components/secrets";

/**
 * Viberglass Infrastructure Stack
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
const pulumiConfig = new pulumi.Config();

// Create CloudWatch log groups with environment-specific retention
const logging: LoggingOutputs = createLogging({
  environment: config.environment,
  retentionInDays: config.logRetentionDays,
});

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
  logGroupName: logging.ecsWorkerLogGroupName,
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

// Determine backend configuration based on environment
const backendCpu = config.environment === "prod" ? "512" : "256";
const backendMemory = config.environment === "prod" ? "1024" : "512";
const backendMinTasks = config.environment === "prod" ? 2 : 1;
const backendMaxTasks = config.environment === "prod" ? 10 : 3;
const backendDesiredCount = config.environment === "prod" ? 2 : 1;

// Create Application Load Balancer for backend API
const loadBalancer: LoadBalancerOutputs = createLoadBalancer({
  environment: config.environment,
  projectName: "viberator",
  vpcId: vpc.vpcId,
  vpcCidr: vpc.vpcCidr,
  publicSubnetIds: vpc.publicSubnetIds,
  backendSecurityGroupId: vpc.backendSecurityGroupId,
  healthCheckPath: "/health",
  backendPort: 80,
});

// Create backend ECS task definition and service
const backendEcs: BackendEcsOutputs = createBackendEcs({
  config,
  repositoryUrl: registry.repositoryUrl,
  logGroupName: logging.backendLogGroupName,
  targetGroupArn: loadBalancer.targetGroupArn,
  privateSubnetIds: vpc.privateSubnetIds,
  backendSecurityGroupId: vpc.backendSecurityGroupId,
  albSecurityGroupId: loadBalancer.albSecurityGroupId,
  databaseSsm: {
    urlPath: database.urlPath,
    hostPath: database.hostPath,
  },
  cpu: backendCpu,
  memory: backendMemory,
  desiredCount: backendDesiredCount,
  minTasks: backendMinTasks,
  maxTasks: backendMaxTasks,
});

// Create backend ECS service (reuse worker cluster)
const backendService = createBackendService({
  config,
  repositoryUrl: registry.repositoryUrl,
  logGroupName: logging.backendLogGroupName,
  targetGroupArn: loadBalancer.targetGroupArn,
  privateSubnetIds: vpc.privateSubnetIds,
  backendSecurityGroupId: vpc.backendSecurityGroupId,
  albSecurityGroupId: loadBalancer.albSecurityGroupId,
  databaseSsm: {
    urlPath: database.urlPath,
    hostPath: database.hostPath,
  },
  cpu: backendCpu,
  memory: backendMemory,
  desiredCount: backendDesiredCount,
  minTasks: backendMinTasks,
  maxTasks: backendMaxTasks,
  taskDefinitionArn: backendEcs.taskDefinitionArn,
  clusterArn: ecsWorker.clusterArn,
  clusterName: ecsWorker.clusterName,
});

// Attach KMS decrypt permission to backend task role
new aws.iam.RolePolicy(`${config.environment}-viberator-backend-kms`, {
  role: backendEcs.taskRoleName,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kms.keyArn}"
    }]
  }`,
});

// Attach S3 access policy to backend task role
const backendS3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberator-backend-s3-access`,
  {
    role: backendEcs.taskRoleName,
    policyArn: storage.accessPolicyArn,
  }
);

// Create OIDC provider for GitHub Actions Amplify deployment
const amplifyOidc: AmplifyOidcOutputs = createAmplifyOidc({
  config,
  githubRepository: "ilities/viberator", // TODO: make configurable
});

// Create Amplify frontend app and branch
const amplifyFrontend: AmplifyFrontendOutputs = createAmplifyFrontend({
  config,
  backendUrl: pulumi.interpolate`http://${loadBalancer.albDnsName}`, // From existing ALB output
  branchName: config.environment === "prod" ? "production" : "main",
  stage: config.environment === "prod" ? "PRODUCTION" : "DEVELOPMENT",
});

// Create SSM parameters for deployment secrets
const secrets: DeploymentSecretsOutputs = createDeploymentSecrets({
  config,
  kmsKeyId: kms.keyId,
  databaseUrl: pulumi.interpolate`postgresql://${config.environment}-viberator-db.${vpc.privateSubnetIds[0]}`,
  databaseHost: pulumi.interpolate`${config.environment}-viberator-db.${vpc.privateSubnetIds[0]}`,
  frontendApiUrl: pulumi.interpolate`http://${loadBalancer.albDnsName}/api`,
  amplifyAppId: pulumiConfig.get("amplifyAppId"),
  amplifyBranch: config.environment,
  ecrRepository: registry.repositoryUrl.apply(url => url.split("/").pop() ?? "viberator-backend"),
  ecsCluster: ecsWorker.clusterName,
  ecsService: backendService.serviceName,
  oidcRoleArn: pulumiConfig.get("oidcRoleArn"),
});

// Export stack outputs
export const awsRegion = config.awsRegion;
export const environment = config.environment;

// VPC outputs
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.vpcCidr;
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

// Logging outputs
export const lambdaLogGroupName = logging.lambdaLogGroupName;
export const lambdaLogGroupArn = logging.lambdaLogGroupArn;
export const ecsWorkerLogGroupName = logging.ecsWorkerLogGroupName;
export const ecsWorkerLogGroupArn = logging.ecsWorkerLogGroupArn;
export const backendLogGroupName = logging.backendLogGroupName;
export const backendLogGroupArn = logging.backendLogGroupArn;

// Backend outputs
export const backendUrl = pulumi.interpolate`http://${loadBalancer.albDnsName}`;
export const backendServiceArn = backendService.serviceArn;
export const backendServiceName = backendService.serviceName;
export const backendTaskDefinitionArn = backendEcs.taskDefinitionArn;
export const backendTaskDefinitionFamily = backendEcs.taskDefinitionFamily;
export const backendExecutionRoleArn = backendEcs.executionRoleArn;
export const backendTaskRoleArn = backendEcs.taskRoleArn;
export const backendImageUri = backendEcs.imageUri;
export const backendScalingTargetArn = backendService.scalingTargetArn;

// Load balancer outputs
export const albDnsName = loadBalancer.albDnsName;
export const albCanonicalHostedZoneId = loadBalancer.albCanonicalHostedZoneId;
export const albArn = loadBalancer.albArn;
export const albTargetGroupArn = loadBalancer.targetGroupArn;
export const albTargetGroupName = loadBalancer.targetGroupName;
export const albSecurityGroupId = loadBalancer.albSecurityGroupId;

// Amplify outputs
export const amplifyAppId = amplifyFrontend.appId;
export const amplifyAppArn = amplifyFrontend.appArn;
export const amplifyDefaultDomain = amplifyFrontend.defaultDomain;
export const amplifyBranchName = amplifyFrontend.branchName;
export const amplifyOidcRoleArn = amplifyOidc.roleArn;
export const amplifySsmAppIdPath = amplifyFrontend.ssmAppIdPath;
export const amplifySsmBranchNamePath = amplifyFrontend.ssmBranchNamePath;
export const amplifySsmRegionPath = amplifyFrontend.ssmRegionPath;

// Secrets outputs
export const secretsSsmPaths = secrets.ssmPaths;
export const deploymentRegionArn = secrets.deploymentRegionArn;
export const deploymentOidcRoleArn = secrets.deploymentOidcRoleArn;
export const deploymentEcrRepositoryArn = secrets.deploymentEcrRepositoryArn;
