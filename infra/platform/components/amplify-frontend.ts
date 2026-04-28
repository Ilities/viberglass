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
  /** Frontend framework (default: "Web") */
  framework?: string;
  /** Amplify stage (default: "PRODUCTION" for prod, "DEVELOPMENT" otherwise) */
  stage?: string;
  /** GitHub repository URL (e.g., "https://github.com/owner/repo") - enables auto-deployment */
  repository?: string;
  /** GitHub OAuth token for repository access (SecretString in AWS Secrets Manager) */
  accessToken?: pulumi.Input<string>;
  /** Custom domain name (e.g., "app.viberglass.io") - configures Amplify custom domain */
  customDomain?: pulumi.Input<string>;
  /** Route 53 hosted zone ID for creating custom domain DNS records */
  route53ZoneId?: pulumi.Input<string>;
}

/**
 * Route53 record details for Amplify custom domain.
 */
export interface AmplifyDnsRecord {
  /** Record name */
  name: pulumi.Input<string>;
  /** Record type */
  type: pulumi.Input<string>;
  /** Record value */
  value: pulumi.Input<string>;
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
  /** Custom domain name (if configured) */
  customDomain: pulumi.Output<string> | undefined;
  /** CloudFront distribution URL for custom domain */
  customDomainUrl: pulumi.Output<string> | undefined;
  /** DNS records to create for custom domain (if not using Route53) */
  customDomainDnsRecords: pulumi.Output<AmplifyDnsRecord[]> | undefined;
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
            - npm ci --legacy-peer-deps
            - npm run build -w @viberglass/types
            - npm run build -w @viberglass/platform-ui -w @viberglass/integration-core
            - npm run build -w @viberglass/integration-bitbucket -w @viberglass/integration-custom -w @viberglass/integration-github -w @viberglass/integration-gitlab -w @viberglass/integration-jira -w @viberglass/integration-linear -w @viberglass/integration-monday -w @viberglass/integration-shortcut -w @viberglass/integration-slack
        build:
          commands:
            - npm run build -w @viberglass/frontend
        postBuild:
          commands:
            - ls -la dist
            - echo "Static build completed successfully"
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*`;

/**
 * Creates an Amplify app and branch for static frontend deployment.
 *
 * This component creates:
 * 1. An Amplify app configured for Vite + React static export with WEB platform
 * 2. An Amplify branch with environment-specific configuration
 * 3. SSM parameters storing the app configuration for CI/CD access
 *
 * CRITICAL: The platform is "WEB" for static hosting (no SSR).
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
  const { config, backendUrl, repository, accessToken, route53ZoneId } = options;

  const isProd = config.environment === "prod";
  const branchName = options.branchName ?? (isProd ? "production" : "main");
  const stage = options.stage ?? (isProd ? "PRODUCTION" : "DEVELOPMENT");
  const framework = options.framework ?? "Web";
  const customDomain = options.customDomain;

  // Enable auto-build when repository is connected (git-based deployment)
  const enableAutoBuild = !!repository;

  const app = new aws.amplify.App(`${config.environment}-viberglass-frontend`, {
    name: `${config.environment}-viberglass-frontend`,
    description: `Viberglass frontend - ${config.environment} environment`,
    platform: "WEB", // Static hosting (no SSR)
    // Build spec for monorepo: install all deps, build shared packages, build frontend
    buildSpec: buildSpec,
    environmentVariables: {
      VITE_API_URL: backendUrl,
      AMPLIFY_MONOREPO_APP_ROOT: "apps/platform-frontend",
    },
    enableAutoBranchCreation: false, // Security: Disable auto-branch creation
    // SPA fallback: serve index.html for any path that doesn't match a static file.
    // Required because dynamic routes (e.g. /project/<slug>/tickets) are client-rendered
    // and only placeholder HTML files are generated at build time.
    customRules: [
      {
        source: "/<*>",
        target: "/index.html",
        status: "404-200",
      },
    ],
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
        VITE_API_URL: backendUrl,
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

  // Configure custom domain if provided
  let amplifyDomain: aws.amplify.DomainAssociation | undefined;
  let customDomainOutput: pulumi.Output<string> | undefined;
  let dnsRecordsOutput: pulumi.Output<AmplifyDnsRecord[]> | undefined;

  if (customDomain) {
    customDomainOutput = pulumi.output(customDomain);
    amplifyDomain = new aws.amplify.DomainAssociation(
      `${config.environment}-viberglass-frontend-domain`,
      {
        appId: app.id,
        domainName: customDomain,
        subDomains: [
          {
            branchName: branch.branchName,
            prefix: "", // Root domain (e.g., app.viberglass.io)
          },
        ],
        // Enable auto-subdomain creation for feature branches (optional)
        enableAutoSubDomain: false,
      },
    );

    // Get DNS records that need to be created
    dnsRecordsOutput = pulumi
      .all([amplifyDomain.arn, amplifyDomain.certificateVerificationDnsRecord])
      .apply(([, certRecord]) => {
        const records: AmplifyDnsRecord[] = [];

        // Certificate validation record (CNAME)
        if (certRecord) {
          // Parse the certificate record which is in format: "name type value"
          const parts = certRecord.split(" ");
          if (parts.length >= 3) {
            records.push({
              name: parts[0],
              type: parts[1],
              value: parts.slice(2).join(" "),
            });
          }
        }

        // CloudFront alias record (CNAME for root domain)
        records.push({
          name: customDomain,
          type: "CNAME",
          value: app.defaultDomain,
        });

        return records;
      });

    // Create Route53 alias record if zone ID is provided
    // Note: Amplify automatically manages the ACM certificate validation record
    // We only need to create the CNAME alias for the custom domain
    if (route53ZoneId) {
      new aws.route53.Record(
        `${config.environment}-viberglass-app-alias`,
        {
          zoneId: route53ZoneId,
          name: customDomain,
          type: "CNAME",
          records: [app.defaultDomain],
          ttl: 300,
        },
      );
    }
  }

  return {
    appId: app.id,
    appArn: app.arn,
    defaultDomain: app.defaultDomain,
    customDomain: customDomainOutput,
    customDomainUrl: customDomainOutput
      ? pulumi.interpolate`https://${customDomainOutput}`
      : undefined,
    customDomainDnsRecords: dnsRecordsOutput,
    branchName: branchName,
    ssmAppIdPath,
    ssmBranchNamePath,
    ssmRegionPath,
  };
}
