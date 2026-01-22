import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as path from "path";
import { InfrastructureConfig } from "../config";
import { QueueOutputs } from "./queue";

/**
 * Lambda worker configuration options.
 */
export interface WorkerLambdaOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** ECR repository URL for the worker image */
  repositoryUrl: pulumi.Output<string>;
  /** SQS queue to trigger the Lambda */
  queue: QueueOutputs;
  /** Lambda timeout in seconds (default: 900 = max Lambda timeout) */
  timeout?: number;
  /** Lambda memory size in MB (default: 2048) */
  memorySize?: number;
  /** Path to Dockerfile for the worker image */
  dockerfilePath?: string;
  /** Build context for docker build */
  contextPath?: string;
}

/**
 * Lambda worker component outputs.
 */
export interface WorkerLambdaOutputs {
  /** Lambda function ARN */
  lambdaArn: pulumi.Output<string>;
  /** Lambda function name */
  lambdaName: pulumi.Output<string>;
  /** Lambda function invoke ARN */
  lambdaInvokeArn: pulumi.Output<string>;
  /** Event source mapping ID */
  eventSourceMappingId: pulumi.Output<string>;
  /** Lambda function image URI */
  imageUri: pulumi.Output<string>;
}

/**
 * Creates a Lambda worker function triggered by SQS.
 *
 * The Lambda runs in a container image from ECR and processes
 * jobs from the SQS queue. It has access to SSM Parameter Store
 * for tenant-specific credentials (GitHub tokens, Claude API keys).
 */
export function createWorkerLambda(options: WorkerLambdaOptions): WorkerLambdaOutputs {
  const timeout = options.timeout ?? 900;
  const memorySize = options.memorySize ?? 2048;
  const contextPath = options.contextPath ?? path.join(__dirname, "../../viberator");
  const dockerfilePath = options.dockerfilePath ?? path.join(contextPath, "docker/viberator-lambda.Dockerfile");

  // Build and publish the container image to ECR
  const image = new awsx.ecr.Image(`${options.config.environment}-viberator-worker-image`, {
    repositoryUrl: options.repositoryUrl,
    context: contextPath,
    dockerfile: dockerfilePath,
    platform: "linux/amd64",
  });

  // IAM role for Lambda
  const lambdaRole = new aws.iam.Role(`${options.config.environment}-viberator-lambda-role`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "lambda.amazonaws.com",
    }),
    tags: options.config.tags,
  });

  // Attach basic execution role policy
  new aws.iam.RolePolicyAttachment(`${options.config.environment}-viberator-lambda-basic-exec`, {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  });

  // Attach SQS execution role policy
  new aws.iam.RolePolicyAttachment(`${options.config.environment}-viberator-lambda-sqs-exec`, {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaSQSQueueExecutionRole,
  });

  // SSM policy for tenant-aware credential access
  const ssmPolicy = new aws.iam.Policy(`${options.config.environment}-viberator-ssm-policy`, {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["ssm:GetParameter", "ssm:GetParameters"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${options.config.awsRegion}:*:parameter/viberator/tenants/*`,
        },
      ],
    },
    tags: options.config.tags,
  });

  new aws.iam.RolePolicyAttachment(`${options.config.environment}-viberator-lambda-ssm`, {
    role: lambdaRole.name,
    policyArn: ssmPolicy.arn,
  });

  // Create the Lambda function using the image from ECR
  const workerLambda = new aws.lambda.Function(`${options.config.environment}-viberator-worker`, {
    packageType: "Image",
    imageUri: image.imageUri,
    role: lambdaRole.arn,
    timeout: timeout,
    memorySize: memorySize,
    environment: {
      variables: {
        HOME: "/tmp",
        NODE_ENV: "production",
        LOG_FORMAT: "json",
        CLAUDE_CONFIG_DIR: "/tmp/config",
        TENANT_CONFIG_PATH_PREFIX: "/viberator/tenants",
      },
    },
    tags: options.config.tags,
  });

  // Trigger Lambda from SQS
  const eventSourceMapping = new aws.lambda.EventSourceMapping(
    `${options.config.environment}-viberator-sqs-trigger`,
    {
      eventSourceArn: options.queue.queueArn,
      functionName: workerLambda.name,
      batchSize: 1,
    }
  );

  return {
    lambdaArn: workerLambda.arn,
    lambdaName: workerLambda.name,
    lambdaInvokeArn: workerLambda.invokeArn,
    eventSourceMappingId: eventSourceMapping.id,
    imageUri: image.imageUri,
  };
}
