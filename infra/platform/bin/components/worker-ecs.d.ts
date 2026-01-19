import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";
/**
 * ECS worker configuration options.
 */
export interface WorkerEcsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** ECR repository URL for the worker image */
  repositoryUrl: pulumi.Output<string>;
  /** Task CPU units (256, 512, 1024, 2048, 4096) */
  cpu?: string;
  /** Task memory in MB (512, 1024, 2048, 4096, 8192, 16384) */
  memory?: string;
  /** Path to Dockerfile for the worker image */
  dockerfilePath?: string;
  /** Build context for docker build */
  contextPath?: string;
}
/**
 * ECS worker component outputs.
 */
export interface WorkerEcsOutputs {
  /** ECS Cluster ARN */
  clusterArn: pulumi.Output<string>;
  /** ECS Cluster name */
  clusterName: pulumi.Output<string>;
  /** Task definition ARN */
  taskDefinitionArn: pulumi.Output<string>;
  /** Task definition family */
  taskDefinitionFamily: pulumi.Output<string>;
  /** Task execution role ARN */
  executionRoleArn: pulumi.Output<string>;
  /** Task role ARN */
  taskRoleArn: pulumi.Output<string>;
  /** Worker container image URI */
  imageUri: pulumi.Output<string>;
}
/**
 * Creates ECS infrastructure for running worker tasks.
 *
 * This creates an ECS cluster with Fargate capacity and a task
 * definition for running worker containers. The worker has access
 * to SSM Parameter Store for tenant credentials.
 *
 * Containers are configured with CloudWatch logging and environment
 * variables for production operation.
 */
export declare function createWorkerEcs(
  options: WorkerEcsOptions,
): WorkerEcsOutputs;
