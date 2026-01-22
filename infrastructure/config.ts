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
  /** Whether to use Fargate Spot for cost savings */
  enableSpot: boolean;
  /** Whether to enable ECS Container Insights */
  containerInsights: boolean;
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
  const enableSpot = config.getBoolean("enableSpot") ?? false;
  const containerInsights = config.getBoolean("containerInsights") ?? true;

  return {
    awsRegion,
    environment,
    enableSpot,
    containerInsights,
    tags: {
      Environment: environment,
      Project: "viberator",
      ManagedBy: "pulumi",
    },
  };
}
