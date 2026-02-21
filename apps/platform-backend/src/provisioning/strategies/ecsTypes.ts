import type { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";

export interface EcsTaskDefinitionDetails {
  taskDefinitionArn?: string;
  family?: string;
  revision?: number;
  status?: string;
  registeredAt?: string;
  registeredBy?: string;
  networkMode?: string;
  cpu?: string;
  memory?: string;
  requiresCompatibilities?: string[];
  containerImages?: Array<{
    name?: string;
    image?: string;
  }>;
}

export interface EcsProvisioningConfig {
  type: "ecs";
  provisioningMode?: "managed" | "prebuilt";
  clusterArn?: string;
  taskDefinitionArn?: string;
  taskDefinition?: RegisterTaskDefinitionCommandInput | Record<string, unknown>;
  taskDefinitionDetails?: EcsTaskDefinitionDetails;
  family?: string;
  containerImage?: string;
  containerName?: string;
  executionRoleArn?: string;
  taskRoleArn?: string;
  cpu?: string;
  memory?: string;
  logGroup?: string;
  logStreamPrefix?: string;
  region?: string;
}
