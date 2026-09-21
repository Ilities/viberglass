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
  /**
   * Tenant IDs this stack serves. When set, worker SSM read grants are written
   * per-tenant instead of `tenants/*`, so a compromised worker cannot decrypt
   * another tenant's credentials. Leave unset only for single-tenant or
   * development stacks — the stack logs a warning in that case.
   */
  tenantIds?: string[];
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
  const tenantIds = config.getObject<string[]>("tenantIds");

  if (tenantIds) {
    const invalid = tenantIds.filter((id) => !/^[a-zA-Z0-9_.-]+$/.test(id));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid tenantIds entries: ${invalid.join(", ")}. ` +
          "Tenant IDs must match /^[a-zA-Z0-9_.-]+$/ to be usable in an IAM resource ARN.",
      );
    }
  }

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
    tenantIds: tenantIds && tenantIds.length > 0 ? tenantIds : undefined,
    tags: {
      Environment: environment,
      Project: "viberglass",
      ManagedBy: "pulumi",
    },
  };
}
