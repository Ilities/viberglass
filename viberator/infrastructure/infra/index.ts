import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as path from "path";

// Create an ECR repository
const repo = new awsx.ecr.Repository("viberator-repo", {
  forceDelete: true,
});

// Build and publish the container image from the project root
const image = new awsx.ecr.Image("viberator-worker-image", {
  repositoryUrl: repo.url,
  context: path.join(__dirname, ".."),
  dockerfile: path.join(
    __dirname,
    "..",
    "docker",
    "viberator-lambda.Dockerfile",
  ),
  platform: "linux/amd64",
});

// Create an SQS queue
const queue = new aws.sqs.Queue("viberator-worker-queue", {
  visibilityTimeoutSeconds: 900, // 15 minutes
});

// IAM role for Lambda
const lambdaRole = new aws.iam.Role("viberator-lambda-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "lambda.amazonaws.com",
  }),
});

// Attach basic execution role policy
new aws.iam.RolePolicyAttachment("viberator-lambda-basic-exec", {
  role: lambdaRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

// Attach SQS execution role policy
new aws.iam.RolePolicyAttachment("viberator-lambda-sqs-exec", {
  role: lambdaRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaSQSQueueExecutionRole,
});

// SSM policy for tenant-aware credential access
const ssmPolicy = new aws.iam.Policy("viberator-ssm-policy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["ssm:GetParameter", "ssm:GetParameters"],
        Effect: "Allow",
        Resource: "arn:aws:ssm:*:*:parameter/viberator/tenants/*",
      },
    ],
  },
});

new aws.iam.RolePolicyAttachment("viberator-lambda-ssm", {
  role: lambdaRole.name,
  policyArn: ssmPolicy.arn,
});

// Create the Lambda function using the image from ECR
const workerLambda = new aws.lambda.Function("viberator-worker", {
  packageType: "Image",
  imageUri: image.imageUri,
  role: lambdaRole.arn,
  timeout: 900, // max Lambda timeout is 15 minutes
  memorySize: 2048, // Increased memory for AI coding tasks
  environment: {
    variables: {
      HOME: "/tmp",
      NODE_ENV: "production",
      LOG_FORMAT: "json",
      CLAUDE_CONFIG_DIR: "/tmp/config",
      TENANT_CONFIG_PATH_PREFIX: "/viberator/tenants",
    },
  },
});

// Trigger Lambda from SQS
new aws.lambda.EventSourceMapping("viberator-sqs-trigger", {
  eventSourceArn: queue.arn,
  functionName: workerLambda.name,
  batchSize: 1,
});

// ========== ECS Worker Infrastructure ==========
// ECS cluster for running ephemeral workers
const cluster = new aws.ecs.Cluster("viberator-ecs-cluster", {
  settings: {

    name: "containerInsights",
    value: "enabled",
  },
});

// Build and publish the ECS worker container image
const ecsImage = new awsx.ecr.Image("viberator-ecs-worker-image", {
  repositoryUrl: repo.url,
  context: path.join(__dirname, ".."),
  dockerfile: path.join(
    __dirname,
    "..",
    "docker",
    "viberator-ecs-worker.Dockerfile",
  ),
  platform: "linux/amd64",
});

// IAM role for ECS task execution
const ecsTaskExecutionRole = new aws.iam.Role("viberator-ecs-task-exec-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "ecs-tasks.amazonaws.com",
  }),
});

new aws.iam.RolePolicyAttachment("viberator-ecs-task-exec-basic", {
  role: ecsTaskExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// IAM role for ECS task (for SSM access)
const ecsTaskRole = new aws.iam.Role("viberator-ecs-task-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "ecs-tasks.amazonaws.com",
  }),
});

// Attach SSM policy to ECS task role
new aws.iam.RolePolicyAttachment("viberator-ecs-task-ssm", {
  role: ecsTaskRole.name,
  policyArn: ssmPolicy.arn,
});

// Container definition for the worker
const workerContainer = new aws.ecs.TaskDefinition("viberator-ecs-worker", {
  family: "viberator-worker",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  cpu: "2048",
  memory: "4096",
  executionRoleArn: ecsTaskExecutionRole.arn,
  taskRoleArn: ecsTaskRole.arn,
  containerDefinitions: JSON.stringify([
    {
      name: "viberator-worker",
      image: ecsImage.imageUri,
      essential: true,
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": "/ecs/viberator-worker",
          "awslogs-region": aws.config.region,
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true",
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
          valueFrom: `arn:aws:ssm:${aws.config.region}:::parameter/viberator/tenants/\${tenantId}/GITHUB_TOKEN`,
        },
        {
          name: "CLAUDE_CODE_API_KEY",
          valueFrom: `arn:aws:ssm:${aws.config.region}:::parameter/viberator/tenants/\${tenantId}/CLAUDE_CODE_API_KEY`,
        },
      ],
    },
  ]),
});

// Export relevant values
export const repositoryUrl = repo.url;
export const queueUrl = queue.url;
export const queueArn = queue.arn;
export const lambdaArn = workerLambda.arn;
export const ecsClusterArn = cluster.arn;
export const ecsClusterName = cluster.name;
export const ecsTaskDefinitionArn = workerContainer.arn;
export const ecsTaskDefinitionFamily = workerContainer.family;
