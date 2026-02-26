import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { getConfig } from "./config";
import { createRegistry, RegistryOutputs } from "./components/registry";
import { createStorage, StorageOutputs } from "./components/storage";
import { createDatabase, DatabaseOutputs } from "./components/database";
import {
  createLoadBalancer,
  LoadBalancerOutputs,
} from "./components/load-balancer";
import {
  BackendEcsOutputs,
  createBackendEcs,
  createBackendService,
} from "./components/backend-ecs";
import {
  AmplifyOidcOutputs,
  createAmplifyOidc,
} from "./components/amplify-oidc";
import {
  AmplifyFrontendOutputs,
  createAmplifyFrontend,
} from "./components/amplify-frontend";
import {
  createDeploymentSecrets,
  DeploymentSecretsOutputs,
} from "./components/secrets";

/**
 * Viberglass Platform Infrastructure Stack
 *
 * This stack creates the platform infrastructure:
 * - ECR repository for container images
 * - RDS PostgreSQL database
 * - Backend ECS service with ALB
 * - Amplify frontend
 * - S3 storage for uploads
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
const pulumiConfig = new pulumi.Config();

// =============================================================================
// BASE STACK REFERENCE
// =============================================================================

// Reference the base stack for shared infrastructure
const baseStack = new pulumi.StackReference(config.baseStack);

// Get outputs from base stack
const vpcId = baseStack.getOutput("vpcId") as pulumi.Output<string>;
const vpcCidr = baseStack.getOutput("vpcCidr") as pulumi.Output<string>;
const publicSubnetIds = baseStack.getOutput("publicSubnetIds") as pulumi.Output<
  string[]
>;
const privateSubnetIds = baseStack.getOutput(
  "privateSubnetIds",
) as pulumi.Output<string[]>;
const backendSecurityGroupId = baseStack.getOutput(
  "backendSecurityGroupId",
) as pulumi.Output<string>;
const rdsSecurityGroupId = baseStack.getOutput(
  "rdsSecurityGroupId",
) as pulumi.Output<string>;
const kmsKeyId = baseStack.getOutput("kmsKeyId") as pulumi.Output<string>;
const kmsKeyArn = baseStack.getOutput("kmsKeyArn") as pulumi.Output<string>;
const backendLogGroupName = baseStack.getOutput(
  "backendLogGroupName",
) as pulumi.Output<string>;
const ecsWorkerLogGroupName = baseStack.getOutput(
  "ecsWorkerLogGroupName",
) as pulumi.Output<string>;
const baseNetworkMode = baseStack.getOutput("networkMode") as pulumi.Output<
  string | undefined
>;
const networkMode = baseNetworkMode.apply((mode) => mode ?? "enterprise");
const backendSubnetIds = pulumi
  .all([privateSubnetIds, publicSubnetIds, networkMode])
  .apply(([privateIds, publicIds, mode]) =>
    mode === "enterprise" ? privateIds : publicIds,
  );
const backendAssignPublicIp = networkMode.apply(
  (mode) => mode !== "enterprise",
);

// =============================================================================
// WORKER STACK REFERENCE (OPTIONAL)
// =============================================================================

// Reference the worker stack for clanker managed provisioning defaults
// If workerStack is not configured, clankers will need manual ECS/Lambda configuration
let workerExecutionRoleArn: pulumi.Output<string> | undefined;
let workerTaskRoleArn: pulumi.Output<string> | undefined;
let workerImageUri: pulumi.Output<string> | undefined;
let workerLambdaImageUri: pulumi.Output<string> | undefined;
let workerLambdaRoleArn: pulumi.Output<string> | undefined;
let workerClusterArn: pulumi.Output<string> | undefined;
let workerSubnetIds: pulumi.Output<string[]> | undefined;
let workerSecurityGroupId: pulumi.Output<string> | undefined;

if (!config.workerStack) {
  pulumi.log.warn(
    "workerStack is not configured. Managed clanker ECS/Lambda provisioning defaults will be unavailable until you set viberglass:workerStack and run `pulumi up` in infra/platform.",
  );
} else {
  pulumi.log.info(
    `Using worker stack reference for clanker managed provisioning: ${config.workerStack}`,
  );
  try {
    const workerStack = new pulumi.StackReference(config.workerStack);
    workerExecutionRoleArn = workerStack.getOutput(
      "ecsExecutionRoleArn",
    ) as pulumi.Output<string>;
    workerTaskRoleArn = workerStack.getOutput(
      "ecsTaskRoleArn",
    ) as pulumi.Output<string>;
    workerImageUri = workerStack.getOutput(
      "ecsImageUri",
    ) as pulumi.Output<string>;
    workerLambdaImageUri = workerStack.getOutput(
      "lambdaImageUri",
    ) as pulumi.Output<string>;
    workerLambdaRoleArn = workerStack.getOutput(
      "lambdaRoleArn",
    ) as pulumi.Output<string>;
    workerClusterArn = workerStack.getOutput(
      "ecsClusterArn",
    ) as pulumi.Output<string>;
    workerSubnetIds = workerStack.getOutput("workerSubnets") as pulumi.Output<
      string[]
    >;
    workerSecurityGroupId = workerStack.getOutput(
      "workerSecurityGroup",
    ) as pulumi.Output<string>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pulumi.log.warn(
      `Failed to initialize worker stack reference '${config.workerStack}'. Managed clanker ECS/Lambda provisioning defaults will be unavailable until this reference resolves. Error: ${message}`,
    );
  }
}

// =============================================================================
// PLATFORM INFRASTRUCTURE
// =============================================================================

// Create ECR repository for container images
const registry: RegistryOutputs = createRegistry({
  config,
  forceDelete: true, // Allow cleanup in dev environments
});

// Create RDS PostgreSQL database with SSM credentials storage
const database: DatabaseOutputs = createDatabase({
  config,
  vpc: {
    privateSubnetIds: privateSubnetIds,
    rdsSecurityGroupId: rdsSecurityGroupId,
  },
  kmsKeyArn: kmsKeyArn,
  instanceClass: config.dbInstanceClass,
  allocatedStorage: config.dbAllocatedStorage,
});

// Create S3 storage for file uploads
const storage: StorageOutputs = createStorage({
  config,
  bucketPrefix: "viberglass-uploads",
  versioningEnabled: config.environment !== "dev",
});

// =============================================================================
// BACKEND ECS INFRASTRUCTURE
// =============================================================================

// Determine backend configuration based on environment
const backendCpu = config.environment === "prod" ? "512" : "256";
const backendMemory = config.environment === "prod" ? "1024" : "512";
const backendMinTasks = config.environment === "prod" ? 2 : 1;
const backendMaxTasks = config.environment === "prod" ? 10 : 3;
const backendDesiredCount = config.environment === "prod" ? 2 : 1;

// Create Application Load Balancer for backend API
const loadBalancer: LoadBalancerOutputs = createLoadBalancer({
  environment: config.environment,
  projectName: "viberglass",
  vpcId: vpcId,
  vpcCidr: vpcCidr,
  publicSubnetIds: publicSubnetIds,
  backendSecurityGroupId: backendSecurityGroupId,
  healthCheckPath: "/health",
  backendPort: 80,
  apiDomain: config.apiDomain,
  route53ZoneId: config.route53ZoneId,
});

// =============================================================================
// AMPLIFY FRONTEND (create first so backend can use its domain for CORS)
// =============================================================================

// Create OIDC provider for GitHub Actions Amplify deployment
const amplifyOidc: AmplifyOidcOutputs = createAmplifyOidc({
  config,
  githubRepository: "ilities/viberglass",
});

// Create Amplify frontend app and branch
// For production: Connect to GitHub for automatic deployments on push to main
// For dev: Manual deployment via GitHub Actions (keeps flexibility for testing)
const repository = "https://github.com/ilities/viberglass";
const amplifyFrontend: AmplifyFrontendOutputs = createAmplifyFrontend({
  config,
  backendUrl: config.apiDomain
    ? pulumi.interpolate`https://${config.apiDomain}`
    : pulumi.interpolate`http://${loadBalancer.albDnsName}`,
  branchName: "main",
  repository: repository,
  accessToken: pulumiConfig.getSecret("amplifyGithubAccessToken"),
  stage: config.environment === "prod" ? "PRODUCTION" : "DEVELOPMENT",
  customDomain: config.appDomain,
  route53ZoneId: config.route53ZoneId,
});

// Create ECS cluster for backend (separate from workers)
const clusterSettings: aws.types.input.ecs.ClusterSetting[] = [];
if (config.containerInsights) {
  clusterSettings.push({
    name: "containerInsights",
    value: "enabled",
  } as aws.types.input.ecs.ClusterSetting);
}

const backendCluster = new aws.ecs.Cluster(
  `${config.environment}-viberglass-backend-cluster`,
  {
    settings: clusterSettings,
    tags: config.tags,
  },
);

// Backend webhook encryption key (SecureString in SSM, generated by Pulumi)
const webhookSecretEncryptionKey = new random.RandomPassword(
  `${config.environment}-viberglass-webhook-secret-encryption-key`,
  {
    length: 64,
    special: false,
  },
);

const webhookSecretEncryptionKeyParam = new aws.ssm.Parameter(
  `${config.environment}-viberglass-webhook-secret-encryption-key`,
  {
    name: `/viberglass/${config.environment}/backend/webhook-secret-encryption-key`,
    type: "SecureString",
    value: webhookSecretEncryptionKey.result,
    keyId: kmsKeyId,
    overwrite: true,
    tags: config.tags,
  },
);

// Create backend ECS task definition with CORS allowed origins from Amplify
const backendEcs: BackendEcsOutputs = createBackendEcs({
  config,
  repositoryUrl: registry.repositoryUrl,
  logGroupName: backendLogGroupName,
  targetGroupArn: loadBalancer.targetGroupArn,
  subnetIds: backendSubnetIds,
  backendSecurityGroupId: backendSecurityGroupId,
  albSecurityGroupId: loadBalancer.albSecurityGroupId,
  databaseSsm: {
    urlPathArn: database.urlPathArn,
    hostPathArn: database.hostPathArn,
  },
  webhookSecretEncryptionKeySsmArn: webhookSecretEncryptionKeyParam.arn,
  cpu: backendCpu,
  memory: backendMemory,
  desiredCount: backendDesiredCount,
  minTasks: backendMinTasks,
  maxTasks: backendMaxTasks,
  imageTag: config.backendImageTag,
  assignPublicIp: backendAssignPublicIp,
  // Allow requests from the Amplify frontend domain (custom domain if set, otherwise default)
  allowedOrigins: config.appDomain
    ? pulumi.interpolate`https://${config.appDomain}`
    : pulumi.interpolate`https://${amplifyFrontend.defaultDomain}`,
  // Platform API URL for worker callbacks (SEC-05)
  platformApiUrl: config.apiDomain
    ? pulumi.interpolate`https://${config.apiDomain}`
    : pulumi.interpolate`http://${loadBalancer.albDnsName}`,
  uploadsBucketName: storage.bucketName,
  ticketMediaS3Prefix: "ticket-media",
  // Pass worker infrastructure values for clanker managed provisioning
  worker:
    workerExecutionRoleArn || workerLambdaImageUri || workerLambdaRoleArn
    ? {
        executionRoleArn: workerExecutionRoleArn,
        taskRoleArn: workerTaskRoleArn,
        imageUri: workerImageUri,
        lambdaImageUri: workerLambdaImageUri,
        lambdaRoleArn: workerLambdaRoleArn,
        clusterArn: workerClusterArn,
        subnetIds: workerSubnetIds,
        securityGroupId: workerSecurityGroupId,
        logGroupName: ecsWorkerLogGroupName,
      }
    : undefined,
});

// Create backend ECS service
const backendService = createBackendService({
  config,
  repositoryUrl: registry.repositoryUrl,
  logGroupName: backendLogGroupName,
  targetGroupArn: loadBalancer.targetGroupArn,
  subnetIds: backendSubnetIds,
  backendSecurityGroupId: backendSecurityGroupId,
  albSecurityGroupId: loadBalancer.albSecurityGroupId,
  databaseSsm: {
    urlPathArn: database.urlPathArn,
    hostPathArn: database.hostPathArn,
  },
  webhookSecretEncryptionKeySsmArn: webhookSecretEncryptionKeyParam.arn,
  cpu: backendCpu,
  memory: backendMemory,
  desiredCount: backendDesiredCount,
  minTasks: backendMinTasks,
  maxTasks: backendMaxTasks,
  taskDefinitionArn: backendEcs.taskDefinitionArn,
  clusterArn: backendCluster.arn,
  clusterName: backendCluster.name,
  assignPublicIp: backendAssignPublicIp,
});

// Attach KMS decrypt permission to backend task role
new aws.iam.RolePolicy(`${config.environment}-viberglass-backend-kms`, {
  role: backendEcs.taskRoleName,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kmsKeyArn}"
    }]
  }`,
});

// Allow ECS task execution role to decrypt SSM SecureString parameters
new aws.iam.RolePolicy(`${config.environment}-viberglass-backend-exec-kms`, {
  role: backendEcs.executionRoleName,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kmsKeyArn}"
    }]
  }`,
});

// Attach S3 access policy to backend task role
new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-backend-s3-access`,
  {
    role: backendEcs.taskRoleName,
    policyArn: storage.accessPolicyArn,
  },
);

// =============================================================================
// DEPLOYMENT SECRETS
// =============================================================================

// Create SSM parameters for deployment secrets
const secrets: DeploymentSecretsOutputs = createDeploymentSecrets({
  config,
  kmsKeyId: kmsKeyId,
  frontendApiUrl: config.apiDomain
    ? pulumi.interpolate`https://${config.apiDomain}/api`
    : pulumi.interpolate`http://${loadBalancer.albDnsName}/api`,
  amplifyAppId: pulumiConfig.get("amplifyAppId"),
  amplifyBranch: config.environment,
  ecrRepository: registry.repositoryUrl.apply(
    (url) => url.split("/").pop() ?? "viberglass-backend",
  ),
  ecsCluster: backendCluster.name,
  ecsService: backendService.serviceName,
  oidcRoleArn: pulumiConfig.get("oidcRoleArn"),
});

// =============================================================================
// STACK EXPORTS
// =============================================================================

// Environment info
export const awsRegion = config.awsRegion;
export const environment = config.environment;

// Base stack reference (for workers stack to use)
export const baseStackName = config.baseStack;

// ECR outputs
export const repositoryUrl = registry.repositoryUrl;
export const repositoryArn = registry.repositoryArn;
export const repositoryId = registry.repositoryId;

// Database outputs
export const databaseEndpoint = database.endpoint;
export const databasePort = database.port;
export const databaseInstanceArn = database.instanceArn;
export const databaseName = database.databaseName;
export const databaseSsmUsernamePath = database.usernamePath;
export const databaseSsmPasswordPath = database.passwordPath;
export const databaseSsmUrlPath = database.urlPathArn;
export const databaseSsmHostPath = database.hostPathArn;

// Storage outputs
export const uploadsBucketName = storage.bucketName;
export const uploadsBucketArn = storage.bucketArn;
export const uploadsAccessPolicyArn = storage.accessPolicyArn;

// Backend outputs
export const backendUrl = config.apiDomain
  ? pulumi.interpolate`https://${config.apiDomain}`
  : pulumi.interpolate`http://${loadBalancer.albDnsName}`;
export const backendClusterArn = backendCluster.arn;
export const backendClusterName = backendCluster.name;
export const backendServiceArn = backendService.serviceArn;
export const backendServiceName = backendService.serviceName;
export const backendTaskDefinitionArn = backendEcs.taskDefinitionArn;
export const backendTaskDefinitionFamily = backendEcs.taskDefinitionFamily;
export const backendExecutionRoleArn = backendEcs.executionRoleArn;
export const backendTaskRoleArn = backendEcs.taskRoleArn;
export const backendImageUri = backendEcs.imageUri;
export const backendWebhookSecretEncryptionKeyPath =
  webhookSecretEncryptionKeyParam.name;

// Load balancer outputs
export const albDnsName = loadBalancer.albDnsName;
export const albCanonicalHostedZoneId = loadBalancer.albCanonicalHostedZoneId;
export const albArn = loadBalancer.albArn;
export const albTargetGroupArn = loadBalancer.targetGroupArn;
export const albTargetGroupName = loadBalancer.targetGroupName;
export const albSecurityGroupId = loadBalancer.albSecurityGroupId;
export const albCertificateArn = loadBalancer.certificateArn;
export const apiDomain = loadBalancer.apiDomain;

// Amplify outputs
export const amplifyAppId = amplifyFrontend.appId;
export const amplifyAppArn = amplifyFrontend.appArn;
export const amplifyDefaultDomain = amplifyFrontend.defaultDomain;
export const amplifyCustomDomain = amplifyFrontend.customDomain;
export const amplifyCustomDomainUrl = amplifyFrontend.customDomainUrl;
export const amplifyCustomDomainDnsRecords =
  amplifyFrontend.customDomainDnsRecords;
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
