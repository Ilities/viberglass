import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * Deployment secrets component configuration options.
 */
export interface DeploymentSecretsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** KMS key ID for SecureString encryption */
  kmsKeyId: pulumi.Input<string>;
  /** Database connection URL (SecureString) */
  databaseUrl: pulumi.Input<string>;
  /** Database host endpoint (SecureString) */
  databaseHost: pulumi.Input<string>;
  /** Frontend API URL (String - not sensitive) */
  frontendApiUrl: pulumi.Input<string>;
  /** Amplify app ID (String - not sensitive) */
  amplifyAppId?: pulumi.Input<string>;
  /** Amplify branch name (String - not sensitive) */
  amplifyBranch?: pulumi.Input<string>;
  /** ECR repository name (String - not sensitive) */
  ecrRepository?: pulumi.Input<string>;
  /** ECS cluster name (String - not sensitive) */
  ecsCluster?: pulumi.Input<string>;
  /** ECS service name (String - not sensitive) */
  ecsService?: pulumi.Input<string>;
  /** OIDC role ARN for GitHub Actions (SecureString) */
  oidcRoleArn?: pulumi.Input<string>;
}

/**
 * Deployment secrets component outputs.
 */
export interface DeploymentSecretsOutputs {
  /** Database URL parameter ARN */
  databaseUrlArn: pulumi.Output<string>;
  /** Database URL parameter path */
  databaseUrlPath: pulumi.Output<string>;
  /** Database host parameter ARN */
  databaseHostArn: pulumi.Output<string>;
  /** Database host parameter path */
  databaseHostPath: pulumi.Output<string>;
  /** Frontend API URL parameter ARN */
  frontendApiUrlArn: pulumi.Output<string>;
  /** Frontend API URL parameter path */
  frontendApiUrlPath: pulumi.Output<string>;
  /** Amplify app ID parameter ARN */
  amplifyAppIdArn: pulumi.Output<string>;
  /** Amplify app ID parameter path */
  amplifyAppIdPath: pulumi.Output<string>;
  /** Amplify branch parameter ARN */
  amplifyBranchArn: pulumi.Output<string>;
  /** Amplify branch parameter path */
  amplifyBranchPath: pulumi.Output<string>;
  /** ECS cluster parameter ARN */
  ecsClusterArn: pulumi.Output<string>;
  /** ECS cluster parameter path */
  ecsClusterPath: pulumi.Output<string>;
  /** ECS service parameter ARN */
  ecsServiceArn: pulumi.Output<string>;
  /** ECS service parameter path */
  ecsServicePath: pulumi.Output<string>;
  /** Deployment region parameter ARN */
  deploymentRegionArn: pulumi.Output<string>;
  /** Deployment region parameter path */
  deploymentRegionPath: pulumi.Output<string>;
  /** Deployment OIDC role ARN parameter */
  deploymentOidcRoleArn: pulumi.Output<string>;
  /** Deployment OIDC role ARN parameter path */
  deploymentOidcRoleArnPath: pulumi.Output<string>;
  /** Deployment ECR repository parameter ARN */
  deploymentEcrRepositoryArn: pulumi.Output<string>;
  /** Deployment ECR repository parameter path */
  deploymentEcrRepositoryPath: pulumi.Output<string>;
  /** All SSM parameter paths for easy reference */
  ssmPaths: {
    databaseUrl: pulumi.Output<string>;
    databaseHost: pulumi.Output<string>;
    frontendApiUrl: pulumi.Output<string>;
    amplifyAppId: pulumi.Output<string>;
    amplifyBranch: pulumi.Output<string>;
    ecsCluster: pulumi.Output<string>;
    ecsService: pulumi.Output<string>;
    region: pulumi.Output<string>;
    oidcRoleArn: pulumi.Output<string>;
    ecrRepository: pulumi.Output<string>;
  };
}

/**
 * Creates SSM parameters for deployment secrets.
 *
 * This function creates SSM Parameter Store parameters for all deployment
 * secrets across the following categories:
 *
 * - **database**: Database connection details (SecureString)
 * - **frontend**: Frontend API URL (String)
 * - **amplify**: Amplify app configuration (String)
 * - **ecs**: ECS cluster and service names (String)
 * - **deployment**: Deployment configuration (mixed)
 *
 * Sensitive values use SecureString type with KMS encryption, while
 * non-sensitive values use String type. All parameters follow the naming
 * convention: /viberglass/{environment}/{category}/{key}
 *
 * @param options - Configuration options for secrets
 * @returns SSM parameter ARNs and paths for workflow references
 */
export function createDeploymentSecrets(
  options: DeploymentSecretsOptions
): DeploymentSecretsOutputs {
  const { config } = options;
  const env = config.environment;

  // Helper to create SSM parameter
  const createParameter = (
    name: string,
    value: pulumi.Input<string>,
    type: "SecureString" | "String"
  ) => {
    const oldLogicalName = `${env}-viberator-${name}`;
    const newLogicalName = `${env}-viberglass-${name}`;
    return new aws.ssm.Parameter(newLogicalName, {
      name: `/viberglass/${env}/${name}`,
      type: type,
      value: value,
      keyId: type === "SecureString" ? options.kmsKeyId : undefined,
      tags: config.tags,
    }, {
      aliases: [{ name: oldLogicalName }],
    });
  };

  // Database secrets (SecureString)
  const databaseUrl = createParameter("database/url", options.databaseUrl, "SecureString");
  const databaseHost = createParameter("database/host", options.databaseHost, "SecureString");

  // Frontend configuration (String - not sensitive)
  const frontendApiUrl = createParameter("frontend/apiUrl", options.frontendApiUrl, "String");

  // Amplify configuration (String - not sensitive)
  const amplifyAppId = createParameter("amplify/appId", options.amplifyAppId ?? "", "String");
  const amplifyBranch = createParameter("amplify/branch", options.amplifyBranch ?? env, "String");

  // ECS configuration (String - not sensitive)
  const ecsCluster = createParameter("ecs/cluster", options.ecsCluster ?? "", "String");
  const ecsService = createParameter("ecs/service", options.ecsService ?? "", "String");

  // Deployment configuration (mixed)
  const deploymentRegion = createParameter("deployment/region", config.awsRegion, "String");
  const deploymentOidcRoleArn = createParameter(
    "deployment/oidcRoleArn",
    options.oidcRoleArn ?? "",
    "SecureString"
  );
  const deploymentEcrRepository = createParameter(
    "deployment/ecrRepository",
    options.ecrRepository ?? "",
    "String"
  );

  return {
    // Database outputs
    databaseUrlArn: databaseUrl.arn,
    databaseUrlPath: databaseUrl.name,
    databaseHostArn: databaseHost.arn,
    databaseHostPath: databaseHost.name,

    // Frontend outputs
    frontendApiUrlArn: frontendApiUrl.arn,
    frontendApiUrlPath: frontendApiUrl.name,

    // Amplify outputs
    amplifyAppIdArn: amplifyAppId.arn,
    amplifyAppIdPath: amplifyAppId.name,
    amplifyBranchArn: amplifyBranch.arn,
    amplifyBranchPath: amplifyBranch.name,

    // ECS outputs
    ecsClusterArn: ecsCluster.arn,
    ecsClusterPath: ecsCluster.name,
    ecsServiceArn: ecsService.arn,
    ecsServicePath: ecsService.name,

    // Deployment outputs
    deploymentRegionArn: deploymentRegion.arn,
    deploymentRegionPath: deploymentRegion.name,
    deploymentOidcRoleArn: deploymentOidcRoleArn.arn,
    deploymentOidcRoleArnPath: deploymentOidcRoleArn.name,
    deploymentEcrRepositoryArn: deploymentEcrRepository.arn,
    deploymentEcrRepositoryPath: deploymentEcrRepository.name,

    // All SSM paths for easy reference
    ssmPaths: {
      databaseUrl: databaseUrl.name,
      databaseHost: databaseHost.name,
      frontendApiUrl: frontendApiUrl.name,
      amplifyAppId: amplifyAppId.name,
      amplifyBranch: amplifyBranch.name,
      ecsCluster: ecsCluster.name,
      ecsService: ecsService.name,
      region: deploymentRegion.name,
      oidcRoleArn: deploymentOidcRoleArn.name,
      ecrRepository: deploymentEcrRepository.name,
    },
  };
}
