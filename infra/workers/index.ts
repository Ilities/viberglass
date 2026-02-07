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
const slackConfig = new pulumi.Config("slack");
const slackAppEnabled = slackConfig.getBoolean("enabled") ?? false;
const tenantConfigPathPrefix = "/viberator/tenants";
const workerSsmParameterArns = [
  `arn:aws:ssm:${config.awsRegion}:*:parameter/viberglass/tenants/*`,
  `arn:aws:ssm:${config.awsRegion}:*:parameter/viberator/tenants/*`,
  `arn:aws:ssm:${config.awsRegion}:*:parameter/viberglass/secrets/*`,
  `arn:aws:ssm:${config.awsRegion}:*:parameter/viberator/secrets/*`,
];

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

// Validate that required base stack outputs exist
kmsKeyArn.apply(arn => {
  if (!arn) {
    throw new Error(
      "kmsKeyArn output is not available from the base stack. " +
      "Please ensure the base stack has been deployed and exports 'kmsKeyArn'."
    );
  }
});
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
const contextPath = path.join(__dirname, "../..");
const lambdaDockerfilePath = path.join(
  __dirname,
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
          Resource: workerSsmParameterArns,
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
        SECRETS_SSM_PREFIX: "/viberator/secrets",
        TENANT_CONFIG_PATH_PREFIX: tenantConfigPathPrefix,
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
// SLACK APP LAMBDA
// =============================================================================

let slackRepository: awsx.ecr.Repository | undefined;
let slackImage: awsx.ecr.Image | undefined;
let slackLambdaRole: aws.iam.Role | undefined;
let slackInstallationsTable: aws.dynamodb.Table | undefined;
let slackLambda: aws.lambda.Function | undefined;
let slackFunctionUrl: aws.lambda.FunctionUrl | undefined;
let slackFunctionUrlPermission: aws.lambda.Permission | undefined;

if (slackAppEnabled) {
  const slackClientId = slackConfig.require("clientId");
  const slackClientSecret = slackConfig.requireSecret("clientSecret");
  const slackSigningSecret = slackConfig.requireSecret("signingSecret");
  const slackStateSecret = slackConfig.requireSecret("stateSecret");
  const slackScopes = slackConfig.get("scopes");
  const slackLogLevel = slackConfig.get("logLevel");
  const slackAppBaseUrl = slackConfig.get("appBaseUrl");

  slackRepository = new awsx.ecr.Repository(
    `${config.environment}-viberglass-slack-app-repo`,
    {
      forceDelete: true,
      tags: config.tags,
    },
  );

  const slackAppContextPath = path.join(__dirname, "../..");
  const slackDockerfilePath = path.join(
    slackAppContextPath,
    "apps/slack-app/Dockerfile.lambda",
  );

  slackImage = new awsx.ecr.Image(
    `${config.environment}-viberglass-slack-app-image`,
    {
      repositoryUrl: slackRepository.url,
      context: slackAppContextPath,
      dockerfile: slackDockerfilePath,
      platform: "linux/amd64",
    },
  );

  slackInstallationsTable = new aws.dynamodb.Table(
    `${config.environment}-viberglass-slack-installations`,
    {
      billingMode: "PAY_PER_REQUEST",
      hashKey: "installationId",
      attributes: [
        {
          name: "installationId",
          type: "S",
        },
      ],
      tags: config.tags,
    },
  );

  slackLambdaRole = new aws.iam.Role(
    `${config.environment}-viberglass-slack-lambda-role`,
    {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "lambda.amazonaws.com",
      }),
      tags: config.tags,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${config.environment}-viberglass-slack-lambda-basic-exec`,
    {
      role: slackLambdaRole.name,
      policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    },
  );

  const slackDynamoPolicy = new aws.iam.Policy(
    `${config.environment}-viberglass-slack-dynamo`,
    {
      policy: slackInstallationsTable.arn.apply((tableArn) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["dynamodb:GetItem", "dynamodb:PutItem"],
              Resource: tableArn,
            },
          ],
        }),
      ),
      tags: config.tags,
    },
  );

  new aws.iam.RolePolicyAttachment(
    `${config.environment}-viberglass-slack-dynamo-attach`,
    {
      role: slackLambdaRole.name,
      policyArn: slackDynamoPolicy.arn,
    },
  );

  const slackEnv: Record<string, pulumi.Input<string>> = {
    NODE_ENV: "production",
    SLACK_CLIENT_ID: slackClientId,
    SLACK_CLIENT_SECRET: slackClientSecret,
    SLACK_SIGNING_SECRET: slackSigningSecret,
    SLACK_STATE_SECRET: slackStateSecret,
    SLACK_INSTALLATION_STORE_TABLE: slackInstallationsTable.name,
  };

  if (slackScopes) {
    slackEnv.SLACK_SCOPES = slackScopes;
  }
  if (slackLogLevel) {
    slackEnv.SLACK_LOG_LEVEL = slackLogLevel;
  }
  if (slackAppBaseUrl) {
    slackEnv.SLACK_APP_BASE_URL = slackAppBaseUrl;
  }

  slackLambda = new aws.lambda.Function(
    `${config.environment}-viberglass-slack-app`,
    {
      name: `viberglass-${config.environment}-slack-app`,
      packageType: "Image",
      imageUri: slackImage.imageUri,
      role: slackLambdaRole.arn,
      timeout: 30,
      memorySize: 512,
      environment: {
        variables: slackEnv,
      },
      tags: config.tags,
    },
  );

  slackFunctionUrl = new aws.lambda.FunctionUrl(
    `${config.environment}-viberglass-slack-app-url`,
    {
      functionName: slackLambda.name,
      authorizationType: "NONE",
    },
  );

  slackFunctionUrlPermission = new aws.lambda.Permission(
    `${config.environment}-viberglass-slack-app-url-permission`,
    {
      action: "lambda:InvokeFunctionUrl",
      function: slackLambda.name,
      principal: "*",
      functionUrlAuthType: "NONE",
    },
  );
}

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
  __dirname,
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

// CloudWatch Logs policy for ECS task execution role
const ecsLogsPolicy = new aws.iam.Policy(
  `${config.environment}-viberglass-ecs-logs-policy`,
  {
    policy: ecsWorkerLogGroupName.apply((logGroupName) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Effect: "Allow",
            Resource: `arn:aws:logs:${config.awsRegion}:*:log-group:${logGroupName}:*`,
          },
        ],
      }),
    ),
    tags: config.tags,
  },
);

new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-ecs-task-exec-logs`,
  {
    role: ecsTaskExecutionRole.name,
    policyArn: ecsLogsPolicy.arn,
  },
);

// SSM policy for ECS task execution role (to read secrets during container startup)
const ecsExecutionSsmPolicy = new aws.iam.Policy(
  `${config.environment}-viberglass-ecs-exec-ssm-policy`,
  {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["ssm:GetParameter", "ssm:GetParameters"],
          Effect: "Allow",
          Resource: workerSsmParameterArns,
        },
      ],
    },
    tags: config.tags,
  },
);

new aws.iam.RolePolicyAttachment(
  `${config.environment}-viberglass-ecs-task-exec-ssm`,
  {
    role: ecsTaskExecutionRole.name,
    policyArn: ecsExecutionSsmPolicy.arn,
  },
);

// KMS decrypt permission for ECS task execution role
new aws.iam.RolePolicy(`${config.environment}-viberglass-ecs-exec-kms`, {
  role: ecsTaskExecutionRole.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "${kmsKeyArn}"
    }]
  }`,
});

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
          Resource: workerSsmParameterArns,
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
              { name: "SECRETS_SSM_PREFIX", value: "/viberator/secrets" },
              {
                name: "TENANT_CONFIG_PATH_PREFIX",
                value: tenantConfigPathPrefix,
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

// Slack app outputs
export { slackAppEnabled };
export const slackAppRepositoryUrl = slackRepository
  ? slackRepository.url
  : pulumi.output(undefined);
export const slackAppRepositoryArn = slackRepository
  ? slackRepository.repository.arn
  : pulumi.output(undefined);
export const slackAppImageUri = slackImage
  ? slackImage.imageUri
  : pulumi.output(undefined);
export const slackAppLambdaArn = slackLambda
  ? slackLambda.arn
  : pulumi.output(undefined);
export const slackAppLambdaName = slackLambda
  ? slackLambda.name
  : pulumi.output(undefined);
export const slackAppFunctionUrl = slackFunctionUrl
  ? slackFunctionUrl.functionUrl
  : pulumi.output(undefined);
export const slackInstallationsTableName = slackInstallationsTable
  ? slackInstallationsTable.name
  : pulumi.output(undefined);
export const slackInstallationsTableArn = slackInstallationsTable
  ? slackInstallationsTable.arn
  : pulumi.output(undefined);

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
