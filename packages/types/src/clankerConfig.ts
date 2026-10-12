import type { AgentType } from "./clanker";

export type ClankerConfigVersion = 1;

export type ClankerStrategyType = "docker" | "ecs" | "lambda" | "kubernetes";

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
  ephemeralStorage?: number;
  environment?: Record<string, string>;
  architecture?: "x86_64" | "arm64";
  vpc?: {
    subnetIds?: string[];
    securityGroupIds?: string[];
  };
  region?: string;
  functionDetails?: Record<string, unknown>;
}

export interface KubernetesStrategyConfig {
  type: "kubernetes";
  provisioningMode?: "prebuilt";
  containerImage?: string;
  namespace?: string;
  cpu?: string;
  memory?: string;
  ephemeralStorage?: string;
  activeDeadlineSeconds?: number;
}

export type ClankerStrategyConfig =
  | DockerStrategyConfig
  | EcsStrategyConfig
  | LambdaStrategyConfig
  | KubernetesStrategyConfig;

export interface CodexAuthConfig {
  mode: CodexAuthMode;
  secretName: string;
  apiKeySecretName?: string;
  /** The runner's stored ChatGPT login, set when the runner is connected. */
  loginSecretId?: string;
}

/** The harness a runner runs, with its declared settings stored as strings under their keys. */
export interface ClankerAgentConfig {
  type: AgentType;
  /** How Codex signs in; set on Codex runners only. */
  codexAuth?: CodexAuthConfig;
  [setting: string]: unknown;
}

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
