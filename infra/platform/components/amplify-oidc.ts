import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * Options for creating Amplify OIDC provider and IAM role.
 */
export interface AmplifyOidcOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** GitHub repository in format "username/repo" */
  githubRepository: string;
}

/**
 * Outputs from the Amplify OIDC component.
 */
export interface AmplifyOidcOutputs {
  /** ARN of the OpenID Connect provider */
  providerArn: pulumi.Output<string>;
  /** ARN of the IAM role for GitHub Actions */
  roleArn: pulumi.Output<string>;
  /** Name of the IAM role for GitHub Actions */
  roleName: pulumi.Output<string>;
}

/**
 * Creates an OpenID Connect provider and IAM role for GitHub Actions to deploy to Amplify.
 *
 * This component creates:
 * 1. An IAM OpenID Connect provider that trusts GitHub Actions
 * 2. An IAM role that GitHub Actions can assume
 * 3. An IAM role policy with Amplify deployment permissions
 *
 * NOTE: This is separate from the Pulumi GitHub OIDC setup to maintain
 * separation of concerns between infrastructure provisioning (Pulumi) and
 * application deployment (Amplify).
 *
 * @param options - Configuration options for the OIDC provider and role
 * @returns Outputs containing the provider ARN, role ARN, and role name
 */
export function createAmplifyOidc(
  options: AmplifyOidcOptions,
): AmplifyOidcOutputs {
  const { config, githubRepository } = options;

  // Create OpenID Connect provider for GitHub Actions
  const oidcProvider = new aws.iam.OpenIdConnectProvider(
    `${config.environment}-viberglass-github-oidc`,
    {
      url: "https://token.actions.githubusercontent.com",
      clientIdLists: ["sts.amazonaws.com"],
      thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
    },
  );

  // Create IAM role that GitHub Actions can assume
  const role = new aws.iam.Role(
    `${config.environment}-viberglass-amplify-github-actions-role`,
    {
      assumeRolePolicy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Federated": "${oidcProvider.arn}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
              "StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
              },
              "StringLike": {
                "token.actions.githubusercontent.com:sub": "repo:${githubRepository}:*"
              }
            }
          }
        ]
      }`,
      tags: config.tags,
    },
  );

  // Create IAM role policy with Amplify permissions
  const rolePolicy = new aws.iam.RolePolicy(
    `${config.environment}-viberglass-amplify-github-actions-policy`,
    {
      role: role.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "amplify:StartDeployment",
              "amplify:GetApp",
              "amplify:GetJob",
            ],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["ssm:GetParameter"],
            Resource: "*",
          },
        ],
      }),
    },
  );

  return {
    providerArn: oidcProvider.arn,
    roleArn: role.arn,
    roleName: role.name,
  };
}
