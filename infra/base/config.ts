import * as pulumi from "@pulumi/pulumi";

/**
 * Base infrastructure configuration loaded from Pulumi stack config.
 * Values are set in Pulumi.{stack}.yaml files.
 */
export type NetworkMode = "enterprise" | "standard";

export interface BaseInfrastructureConfig {
  /** AWS region for resources */
  awsRegion: string;
  /** Environment name (dev, staging, prod) */
  environment: string;
  /** Network mode (enterprise uses private subnets + NAT, standard uses public compute subnets) */
  networkMode: NetworkMode;
  /** Use single NAT gateway for cost savings (default: true for dev/staging) */
  singleNatGateway: boolean;
  /** Log retention in days (default: 7 for dev, 30 for staging, 90 for prod) */
  logRetentionDays: number;
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
export function getConfig(): BaseInfrastructureConfig {
  const config = new pulumi.Config();

  const awsRegion = config.require("awsRegion");
  const environment = config.require("environment");
  const networkModeRaw = config.get("networkMode") ?? "enterprise";
  const singleNatGateway = config.getBoolean("singleNatGateway");
  const logRetentionDays = config.getNumber("logRetentionDays");

  const normalizedNetworkMode =
    networkModeRaw === "non-enterprise" ? "standard" : networkModeRaw;
  if (
    normalizedNetworkMode !== "enterprise" &&
    normalizedNetworkMode !== "standard"
  ) {
    throw new Error(
      `Invalid networkMode: ${networkModeRaw}. Expected "enterprise" or "standard".`,
    );
  }

  // Set defaults based on environment
  let finalSingleNatGateway = singleNatGateway;
  let finalLogRetentionDays = logRetentionDays;

  if (finalSingleNatGateway === undefined) {
    finalSingleNatGateway = environment !== "prod";
  }

  if (finalLogRetentionDays === undefined) {
    switch (environment) {
      case "prod":
        finalLogRetentionDays = 90;
        break;
      case "staging":
        finalLogRetentionDays = 30;
        break;
      default:
        finalLogRetentionDays = 7;
    }
  }

  return {
    awsRegion,
    environment,
    networkMode: normalizedNetworkMode,
    singleNatGateway: finalSingleNatGateway,
    logRetentionDays: finalLogRetentionDays,
    tags: {
      Environment: environment,
      Project: "viberglass",
      ManagedBy: "pulumi",
    },
  };
}
