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
  /** GitHub repository URL (e.g., "https://github.com/owner/repo") - enables auto-deployment */
  repository?: string;
  /** GitHub OAuth token for repository access (SecretString in AWS Secrets Manager) */
  accessToken?: pulumi.Input<string>;
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

const buildSpec = `version: 1
applications:
- appRoot: apps/platform-frontend
frontend:
  phases:
    preBuild:
      commands:
        # Install all dependencies (required for monorepo workspace support)
        - npm ci --legacy-peer-deps
        # Build shared packages first (types, etc.)
        - npm run build -w @viberglass/types
    build:
      commands:
        # Build only the frontend package
        - npm run build -w @viberglass/frontend
    postBuild:
      commands:
        # Verify build output
        - ls -la .next
        - echo "Build completed successfully"
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*`;

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
 * When repository is provided, Amplify will automatically deploy on git pushes.
 * When repository is not provided, deployments must be triggered manually via AWS CLI.
 *
 * @param options - Configuration options for the Amplify app and branch
 * @returns Outputs containing the app configuration and SSM parameter paths
 */
export function createAmplifyFrontend(
  options: AmplifyFrontendOptions,
): AmplifyFrontendOutputs {
  const { config, backendUrl, repository, accessToken } = options;

  const isProd = config.environment === "prod";
  const branchName = options.branchName ?? (isProd ? "production" : "main");
  const stage = options.stage ?? (isProd ? "PRODUCTION" : "DEVELOPMENT");
  const framework = options.framework ?? "Next.js - SSR";

  // Enable auto-build when repository is connected (git-based deployment)
  const enableAutoBuild = !!repository;

  const app = new aws.amplify.App(`${config.environment}-viberglass-frontend`, {
    name: `${config.environment}-viberglass-frontend`,
    description: `Viberglass frontend - ${config.environment} environment`,
    platform: "WEB_COMPUTE", // Required for SSR support
    // Build spec for monorepo: install all deps, build shared packages, build frontend
    buildSpec: buildSpec,
    environmentVariables: {
      NEXT_PUBLIC_API_URL: backendUrl,
      AMPLIFY_MONOREPO_APP_ROOT: "apps/platform-frontend",
    },
    enableAutoBranchCreation: false, // Security: Disable auto-branch creation
    // Enable Git-based auto-deployment when repository is provided
    ...(repository && {
      repository,
      accessToken,
      enableBasicAuth: false,
    }),
    tags: config.tags,
  });

  const branch = new aws.amplify.Branch(
    `${config.environment}-viberglass-frontend-branch`,
    {
      appId: app.id,
      branchName: branchName,
      stage: stage,
      framework: framework,
      enableAutoBuild: enableAutoBuild, // Auto-build when connected to git
      environmentVariables: {
        NEXT_PUBLIC_API_URL: backendUrl,
        AMPLIFY_MONOREPO_APP_ROOT: "apps/platform-frontend",
      },
      tags: config.tags,
    },
  );

  const ssmAppIdPath = `/viberglass/${config.environment}/amplify/appId`;
  const ssmBranchNamePath = `/viberglass/${config.environment}/amplify/branchName`;
  const ssmRegionPath = `/viberglass/${config.environment}/amplify/region`;

  const ssmAppId = new aws.ssm.Parameter(ssmAppIdPath, {
    name: ssmAppIdPath,
    value: app.id,
    type: "String",
    tags: config.tags,
    overwrite: true,
  });

  const ssmBranchName = new aws.ssm.Parameter(ssmBranchNamePath, {
    name: ssmBranchNamePath,
    value: branchName,
    type: "String",
    tags: config.tags,
    overwrite: true,
  });

  const ssmRegion = new aws.ssm.Parameter(ssmRegionPath, {
    name: ssmRegionPath,
    value: config.awsRegion,
    type: "String",
    tags: config.tags,
    overwrite: true,
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
