import type { AgentType } from "./clanker";

export type ClankerConfigVersion = 1;

export type ClankerStrategyType = "docker" | "ecs" | "lambda";

export type CodexAuthMode =
  | "api_key"
  | "chatgpt_device"
  | "chatgpt_device_stored";

export interface ClankerRuntimeConfig {
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
}

export interface DockerStrategyConfig {
  type: "docker";
  provisioningMode?: "managed" | "prebuilt";
  containerImage?: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
  imageMetadata?: Record<string, unknown>;
  dockerBuild?: Record<string, unknown>;
}

export interface EcsStrategyConfig {
  type: "ecs";
  provisioningMode?: "managed" | "prebuilt";
  clusterArn?: string;
  taskDefinitionArn?: string;
  subnetIds?: string[];
  securityGroupIds?: string[];
  assignPublicIp?: "ENABLED" | "DISABLED";
  containerName?: string;
  taskDefinition?: Record<string, unknown>;
  taskDefinitionDetails?: Record<string, unknown>;
  family?: string;
  containerImage?: string;
  executionRoleArn?: string;
  taskRoleArn?: string;
  cpu?: string;
  memory?: string;
  logGroup?: string;
  logStreamPrefix?: string;
  region?: string;
}

export interface LambdaStrategyConfig {
  type: "lambda";
  provisioningMode?: "managed" | "prebuilt";
  functionName?: string;
  functionArn?: string;
  imageUri?: string;
  roleArn?: string;
  memorySize?: number;
  timeout?: number;
  environment?: Record<string, string>;
  architecture?: "x86_64" | "arm64";
  vpc?: {
    subnetIds?: string[];
    securityGroupIds?: string[];
  };
  region?: string;
  functionDetails?: Record<string, unknown>;
}

export type ClankerStrategyConfig =
  | DockerStrategyConfig
  | EcsStrategyConfig
  | LambdaStrategyConfig;

export interface CodexAuthConfig {
  mode: CodexAuthMode;
  secretName: string;
  apiKeySecretName?: string;
}

export interface CodexAgentConfig {
  type: "codex";
  codexAuth: CodexAuthConfig;
  cli?: {
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

export interface GenericAgentConfig {
  type: Exclude<AgentType, "codex">;
}

export type ClankerAgentConfig = CodexAgentConfig | GenericAgentConfig;

export interface ClankerConfigV1 {
  version: 1;
  strategy: ClankerStrategyConfig;
  agent: ClankerAgentConfig;
  runtime?: ClankerRuntimeConfig;
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isClankerConfigV1(value: unknown): value is ClankerConfigV1 {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (value.version !== 1) {
    return false;
  }

  if (!isObjectRecord(value.strategy) || typeof value.strategy.type !== "string") {
    return false;
  }

  if (!isObjectRecord(value.agent) || typeof value.agent.type !== "string") {
    return false;
  }

  return true;
}
