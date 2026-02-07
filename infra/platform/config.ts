import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";

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
  /** Worker stack name for StackReference (e.g., "viberglass-workers/dev") - optional for clanker ECS provisioning */
  workerStack?: string;
  /** Whether to use Fargate Spot for cost savings */
  enableSpot: boolean;
  /** Whether to enable ECS Container Insights */
  containerInsights: boolean;
  /** Database instance class (default per environment) */
  dbInstanceClass?: string;
  /** Database allocated storage in GB (default per environment) */
  dbAllocatedStorage?: number;
  /** API domain name (e.g., "api.viberglass.io") - creates ACM cert and HTTPS listener */
  apiDomain?: string;
  /** Frontend domain name (e.g., "app.viberglass.io") - configures Amplify custom domain */
  appDomain?: string;
  /** Route 53 hosted zone ID for DNS validation and alias records (required if apiDomain is set) */
  route53ZoneId?: string;
  /** Backend container image tag used for ECS task definitions (defaults to current Git SHA) */
  backendImageTag: string;
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
  const workerStack = config.get("workerStack");
  const enableSpot = config.getBoolean("enableSpot") ?? false;
  const containerInsights = config.getBoolean("containerInsights") ?? true;
  const dbInstanceClass = config.get("dbInstanceClass");
  const dbAllocatedStorage = config.getNumber("dbAllocatedStorage");
  const apiDomain = config.get("apiDomain");
  const appDomain = config.get("appDomain");
  const route53ZoneId = config.get("route53ZoneId");
  const backendImageTag =
    config.get("backendImageTag") ??
    process.env.BACKEND_IMAGE_TAG ??
    process.env.GITHUB_SHA ??
    process.env.CI_COMMIT_SHA ??
    getCurrentGitSha() ??
    "latest";

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
    workerStack,
    enableSpot,
    containerInsights,
    dbInstanceClass: finalDbInstanceClass,
    dbAllocatedStorage: finalDbAllocatedStorage,
    apiDomain,
    appDomain,
    route53ZoneId,
    backendImageTag,
    tags: {
      Environment: environment,
      Project: "viberglass",
      ManagedBy: "pulumi",
    },
  };
}

function getCurrentGitSha(): string | undefined {
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}
