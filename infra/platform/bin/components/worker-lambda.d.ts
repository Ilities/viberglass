import * as pulumi from "@pulumi/pulumi";
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
  /** Lambda IAM role name */
  lambdaRoleName: pulumi.Output<string>;
}
/**
 * Creates a Lambda worker function triggered by SQS.
 *
 * The Lambda runs in a container image from ECR and processes
 * jobs from the SQS queue. It has access to SSM Parameter Store
 * for tenant-specific credentials (GitHub tokens, Claude API keys).
 */
export declare function createWorkerLambda(
  options: WorkerLambdaOptions,
): WorkerLambdaOutputs;
