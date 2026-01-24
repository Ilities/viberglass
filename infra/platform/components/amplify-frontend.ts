import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * Options for creating Amplify frontend app and branch.
 */
export interface AmplifyFrontendOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Backend API URL (from load balancer output) */
  backendUrl: pulumi.Input<string>;
  /** Branch name (default: "production" for prod, "main" otherwise) */
  branchName?: string;
  /** Frontend framework (default: "Next.js - SSR") */
  framework?: string;
  /** Amplify stage (default: "PRODUCTION" for prod, "DEVELOPMENT" otherwise) */
  stage?: string;
}

/**
 * Outputs from the Amplify frontend component.
 */
export interface AmplifyFrontendOutputs {
  /** Amplify app ID */
  appId: pulumi.Output<string>;
  /** Amplify app ARN */
  appArn: pulumi.Output<string>;
  /** Default domain for the app */
  defaultDomain: pulumi.Output<string>;
  /** Branch name */
  branchName: string;
  /** SSM parameter path for app ID */
  ssmAppIdPath: string;
  /** SSM parameter path for branch name */
  ssmBranchNamePath: string;
  /** SSM parameter path for region */
  ssmRegionPath: string;
}

/**
 * Creates an Amplify app and branch for frontend deployment with SSR support.
 *
 * This component creates:
 * 1. An Amplify app configured for Next.js SSR with WEB_COMPUTE platform
 * 2. An Amplify branch with environment-specific configuration
 * 3. SSM parameters storing the app configuration for CI/CD access
 *
 * CRITICAL: The platform must be "WEB_COMPUTE" (not "WEB") to support SSR.
 * CRITICAL: Auto-branch creation is disabled for security.
 *
 * @param options - Configuration options for the Amplify app and branch
 * @returns Outputs containing the app configuration and SSM parameter paths
 */
export function createAmplifyFrontend(
  options: AmplifyFrontendOptions
): AmplifyFrontendOutputs {
  const { config, backendUrl } = options;

  // Determine defaults based on environment
  const isProd = config.environment === "prod";
  const branchName = options.branchName ?? (isProd ? "production" : "main");
  const stage = options.stage ?? (isProd ? "PRODUCTION" : "DEVELOPMENT");
  const framework = options.framework ?? "Next.js - SSR";

  // Create Amplify app with SSR support
  const app = new aws.amplify.App(`${config.environment}-viberglass-frontend`, {
    name: `${config.environment}-viberglass-frontend`,
    description: `Viberglass frontend - ${config.environment} environment`,
    platform: "WEB_COMPUTE", // CRITICAL: Required for SSR support
    buildSpec: `version: 1
backend:
  phases:
    preBuild:
      commands:
        - npm ci --legacy-peer-deps
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*`,
    environmentVariables: {
      NEXT_PUBLIC_API_URL: backendUrl,
    },
    enableAutoBranchCreation: false, // Security: Disable auto-branch creation
    tags: config.tags,
  });

  // Create Amplify branch
  const branch = new aws.amplify.Branch(
    `${config.environment}-viberglass-frontend-branch`,
    {
      appId: app.id,
      branchName: branchName,
      stage: stage,
      framework: framework,
      enableAutoBuild: false, // Build via GitHub Actions
      environmentVariables: {
        NEXT_PUBLIC_API_URL: backendUrl,
      },
      tags: config.tags,
    }
  );

  // Define SSM parameter paths
  const ssmAppIdPath = `/viberglass/${config.environment}/amplify/appId`;
  const ssmBranchNamePath = `/viberglass/${config.environment}/amplify/branchName`;
  const ssmRegionPath = `/viberglass/${config.environment}/amplify/region`;

  // Define old SSM parameter paths for aliases (backward compatibility)
  const oldSsmAppIdPath = `/viberator/${config.environment}/amplify/appId`;
  const oldSsmBranchNamePath = `/viberator/${config.environment}/amplify/branchName`;
  const oldSsmRegionPath = `/viberator/${config.environment}/amplify/region`;

  // Create SSM parameter for app ID
  const ssmAppId = new aws.ssm.Parameter(ssmAppIdPath, {
    name: ssmAppIdPath,
    value: app.id,
    type: "String",
    tags: config.tags,
  });

  // Create SSM parameter for branch name
  const ssmBranchName = new aws.ssm.Parameter(ssmBranchNamePath, {
    name: ssmBranchNamePath,
    value: branchName,
    type: "String",
    tags: config.tags,
  });

  // Create SSM parameter for region
  const ssmRegion = new aws.ssm.Parameter(ssmRegionPath, {
    name: ssmRegionPath,
    value: config.awsRegion,
    type: "String",
    tags: config.tags,
  });

  // Create alias SSM parameters for backward compatibility
  const oldSsmAppId = new aws.ssm.Parameter(oldSsmAppIdPath, {
    name: oldSsmAppIdPath,
    value: app.id,
    type: "String",
    tags: config.tags,
  });

  const oldSsmBranchName = new aws.ssm.Parameter(oldSsmBranchNamePath, {
    name: oldSsmBranchNamePath,
    value: branchName,
    type: "String",
    tags: config.tags,
  });

  const oldSsmRegion = new aws.ssm.Parameter(oldSsmRegionPath, {
    name: oldSsmRegionPath,
    value: config.awsRegion,
    type: "String",
    tags: config.tags,
  });

  return {
    appId: app.id,
    appArn: app.arn,
    defaultDomain: app.defaultDomain,
    branchName: branchName,
    ssmAppIdPath,
    ssmBranchNamePath,
    ssmRegionPath,
  };
}
