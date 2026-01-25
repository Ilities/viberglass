import * as pulumi from "@pulumi/pulumi";

/**
 * Infrastructure configuration loaded from Pulumi stack config.
 * Values are set in Pulumi.{stack}.yaml files.
 */
export interface InfrastructureConfig {
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
  /** Database instance class (default per environment) */
  dbInstanceClass?: string;
  /** Database allocated storage in GB (default per environment) */
  dbAllocatedStorage?: number;
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
export function getConfig(): InfrastructureConfig {
  const config = new pulumi.Config();

  const awsRegion = config.require("awsRegion");
  const environment = config.require("environment");
  const baseStack = config.require("baseStack");
  const enableSpot = config.getBoolean("enableSpot") ?? false;
  const containerInsights = config.getBoolean("containerInsights") ?? true;
  const dbInstanceClass = config.get("dbInstanceClass");
  const dbAllocatedStorage = config.getNumber("dbAllocatedStorage");

  // Set database defaults based on environment
  let finalDbInstanceClass = dbInstanceClass;
  let finalDbAllocatedStorage = dbAllocatedStorage;

  if (!finalDbInstanceClass) {
    switch (environment) {
      case "prod":
        finalDbInstanceClass = "db.m6g.xlarge";
        break;
      case "staging":
        finalDbInstanceClass = "db.t4g.large";
        break;
      default:
        finalDbInstanceClass = "db.t4g.micro";
    }
  }

  if (finalDbAllocatedStorage === undefined) {
    switch (environment) {
      case "prod":
        finalDbAllocatedStorage = 100;
        break;
      case "staging":
        finalDbAllocatedStorage = 50;
        break;
      default:
        finalDbAllocatedStorage = 20;
    }
  }

  return {
    awsRegion,
    environment,
    baseStack,
    enableSpot,
    containerInsights,
    dbInstanceClass: finalDbInstanceClass,
    dbAllocatedStorage: finalDbAllocatedStorage,
    tags: {
      Environment: environment,
      Project: "viberglass",
      ManagedBy: "pulumi",
    },
  };
}
