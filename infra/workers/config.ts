import * as pulumi from "@pulumi/pulumi";

/**
 * Workers infrastructure configuration loaded from Pulumi stack config.
 * Values are set in Pulumi.{stack}.yaml files.
 */
export interface WorkersInfrastructureConfig {
  /** AWS region for resources */
  awsRegion: string;
  /** Environment name (dev, staging, prod) */
  environment: string;
  /** Base stack name for StackReference (e.g., "viberglass-base/dev") */
  baseStack: string;
  /** Whether to use Fargate Spot for cost savings */
  enableSpot: boolean;
  /** Whether to enable ECS Container Insights */
  containerInsights: boolean;
  /** S3 bucket used for uploaded assets and ticket media */
  uploadsBucketName: string;
  /** S3 key prefix for ticket media objects */
  ticketMediaS3Prefix: string;
  /** ECR image URI for Lambda worker (optional - derived from catalog if not set) */
  lambdaImageUri?: string;
  /** ECR image URI for ECS worker (optional - derived from catalog if not set) */
  ecsImageUri?: string;
  /** ECR image URI for Slack app (optional) */
  slackAppImageUri?: string;
  /** Common tags applied to all resources */
  tags: {
    Environment: string;
    Project: string;
    ManagedBy: string;
  };
}

/**
 * Load configuration from Pulumi stack.
 * Provides defaults for development where appropriate.
 */
export function getConfig(): WorkersInfrastructureConfig {
  const config = new pulumi.Config();

  const awsRegion = config.require("awsRegion");
  const environment = config.require("environment");
  const baseStack = config.require("baseStack");
  const enableSpot = config.getBoolean("enableSpot") ?? false;
  const containerInsights = config.getBoolean("containerInsights") ?? true;
  const uploadsBucketName =
    config.get("uploadsBucketName") || `${environment}-viberglass-uploads`;
  const ticketMediaS3Prefix = config.get("ticketMediaS3Prefix") || "ticket-media";
  const lambdaImageUri = config.get("lambdaImageUri");
  const ecsImageUri = config.get("ecsImageUri");
  const slackAppImageUri = config.get("slackAppImageUri");

  return {
    awsRegion,
    environment,
    baseStack,
    enableSpot,
    containerInsights,
    uploadsBucketName,
    ticketMediaS3Prefix,
    lambdaImageUri,
    ecsImageUri,
    slackAppImageUri,
    tags: {
      Environment: environment,
      Project: "viberglass",
      ManagedBy: "pulumi",
    },
  };
}
