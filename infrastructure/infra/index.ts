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

// Export relevant values
export const repositoryUrl = repo.url;
export const queueUrl = queue.url;
export const queueArn = queue.arn;
export const lambdaArn = workerLambda.arn;
