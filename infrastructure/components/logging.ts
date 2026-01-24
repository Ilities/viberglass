import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Logging component configuration options.
 */
export interface LoggingOptions {
  /** Environment name for log group naming */
  environment: string;
  /** Log retention in days (default: 7 for dev, 30 for staging, 90 for prod) */
  retentionInDays?: number;
  /** Common tags applied to all log groups */
  tags?: { [key: string]: string };
}

/**
 * Logging component outputs.
 */
export interface LoggingOutputs {
  /** Lambda worker log group name */
  lambdaLogGroupName: pulumi.Output<string>;
  /** Lambda worker log group ARN */
  lambdaLogGroupArn: pulumi.Output<string>;
  /** ECS worker log group name */
  ecsWorkerLogGroupName: pulumi.Output<string>;
  /** ECS worker log group ARN */
  ecsWorkerLogGroupArn: pulumi.Output<string>;
  /** Backend log group name */
  backendLogGroupName: pulumi.Output<string>;
  /** Backend log group ARN */
  backendLogGroupArn: pulumi.Output<string>;
}

/**
 * Determines log retention days based on environment.
 * Defaults: dev=7, staging=30, prod=90
 */
function getDefaultRetentionDays(environment: string): number {
  switch (environment) {
    case "prod":
      return 90;
    case "staging":
      return 30;
    default:
      return 7;
  }
}

/**
 * Creates CloudWatch log groups with configurable retention policies.
 *
 * This component centralizes log group creation for Lambda and ECS workloads.
 * All log groups are tagged for cost allocation and have environment-specific
 * retention policies.
 *
 * Retention defaults:
 * - dev: 7 days
 * - staging: 30 days
 * - prod: 90 days
 */
export function createLogging(options: LoggingOptions): LoggingOutputs {
  const retentionInDays = options.retentionInDays ?? getDefaultRetentionDays(options.environment);

  const defaultTags = {
    Project: "viberglass",
    Environment: options.environment,
    ManagedBy: "pulumi",
    ...options.tags,
  };

  // Lambda worker log group
  // Lambda automatically creates logs to /aws/lambda/{function-name}
  const lambdaLogGroup = new aws.cloudwatch.LogGroup(`${options.environment}-viberglass-lambda-logs`, {
    name: `/aws/lambda/viberglass-${options.environment}-worker`,
    retentionInDays: retentionInDays,
    tags: defaultTags,
  });

  // ECS worker log group
  const ecsWorkerLogGroup = new aws.cloudwatch.LogGroup(`${options.environment}-viberglass-ecs-worker-logs`, {
    name: `/ecs/viberglass-${options.environment}-worker`,
    retentionInDays: retentionInDays,
    tags: defaultTags,
  });

  // Backend log group
  const backendLogGroup = new aws.cloudwatch.LogGroup(`${options.environment}-viberglass-backend-logs`, {
    name: `/ecs/viberglass-${options.environment}-backend`,
    retentionInDays: retentionInDays,
    tags: defaultTags,
  });

  return {
    lambdaLogGroupName: lambdaLogGroup.name,
    lambdaLogGroupArn: lambdaLogGroup.arn,
    ecsWorkerLogGroupName: ecsWorkerLogGroup.name,
    ecsWorkerLogGroupArn: ecsWorkerLogGroup.arn,
    backendLogGroupName: backendLogGroup.name,
    backendLogGroupArn: backendLogGroup.arn,
  };
}
