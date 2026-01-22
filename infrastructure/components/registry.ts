import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * ECR repository configuration options.
 */
export interface RegistryOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Force delete repository even if it contains images */
  forceDelete?: boolean;
}

/**
 * ECR repository component outputs.
 */
export interface RegistryOutputs {
  /** Repository URL for docker push/pull */
  repositoryUrl: pulumi.Output<string>;
  /** Repository ARN */
  repositoryArn: pulumi.Output<string>;
  /** Repository ID */
  repositoryId: pulumi.Output<string>;
}

/**
 * Creates an ECR repository for container images.
 *
 * This repository stores both Lambda and ECS worker images.
 * The repository is configured to allow force delete for
 * easier development environment cleanup.
 */
export function createRegistry(options: RegistryOptions): RegistryOutputs {
  const repo = new awsx.ecr.Repository(`${options.config.environment}-viberator-repo`, {
    forceDelete: options.forceDelete ?? true,
    tags: options.config.tags,
  });

  return {
    repositoryUrl: repo.url,
    repositoryArn: repo.repository.arn,
    repositoryId: repo.repository.id,
  };
}
