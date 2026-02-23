import {
  AgentType,
  Clanker,
  ClankerAgentConfig,
  ClankerConfigV1,
  ClankerStrategyConfig,
  ClankerStrategyType,
  GenericAgentConfig,
} from "@viberglass/types";
import { normalizeCodexAgentConfig } from "./agents/codex";
import { normalizeQwenAgentConfig } from "./agents/qwen";
import { normalizeDockerStrategyConfig } from "./strategies/docker";
import { normalizeEcsStrategyConfig } from "./strategies/ecs";
import { normalizeLambdaStrategyConfig } from "./strategies/lambda";
import { toObjectRecord } from "./parsers";

function normalizeStrategyName(name: string | undefined): ClankerStrategyType {
  const normalized = (name || "").toLowerCase();
  if (normalized === "ecs") {
    return "ecs";
  }
  if (normalized === "aws-lambda-container" || normalized === "lambda") {
    return "lambda";
  }
  return "docker";
}

function normalizeGenericAgent(agent?: AgentType | null): GenericAgentConfig {
  switch (agent) {
    case "claude-code":
    case "opencode":
    case "kimi-code":
    case "gemini-cli":
    case "mistral-vibe":
      return { type: agent };
    default:
      return { type: "claude-code" };
  }
}

function asRuntimeSettings(
  value: unknown,
): {
  maxChanges?: number;
  testRequired?: boolean;
  codingStandards?: string;
  runTests?: boolean;
  testCommand?: string;
  maxExecutionTime?: number;
} | undefined {
  const source = toObjectRecord(value);
  if (!source) {
    return undefined;
  }

  const settings = {
    ...(typeof source.maxChanges === "number"
      ? { maxChanges: source.maxChanges }
      : {}),
    ...(typeof source.testRequired === "boolean"
      ? { testRequired: source.testRequired }
      : {}),
    ...(typeof source.codingStandards === "string"
      ? { codingStandards: source.codingStandards }
      : {}),
    ...(typeof source.runTests === "boolean"
      ? { runTests: source.runTests }
      : {}),
    ...(typeof source.testCommand === "string"
      ? { testCommand: source.testCommand }
      : {}),
    ...(typeof source.maxExecutionTime === "number"
      ? { maxExecutionTime: source.maxExecutionTime }
      : {}),
  };

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeStrategy(
  strategyType: ClankerStrategyType,
  deploymentConfig: Record<string, unknown>,
): ClankerStrategyConfig {
  if (strategyType === "ecs") {
    return normalizeEcsStrategyConfig(deploymentConfig);
  }

  if (strategyType === "lambda") {
    return normalizeLambdaStrategyConfig(deploymentConfig);
  }

  return normalizeDockerStrategyConfig(deploymentConfig);
}

export function mapLegacyClankerConfig(clanker: Clanker): ClankerConfigV1 {
  const deploymentConfig = toObjectRecord(clanker.deploymentConfig) || {};

  const strategyType = normalizeStrategyName(clanker.deploymentStrategy?.name);
  const strategy = normalizeStrategy(strategyType, deploymentConfig);

  const agent: ClankerAgentConfig =
    clanker.agent === "codex"
      ? normalizeCodexAgentConfig(deploymentConfig)
      : clanker.agent === "qwen-cli"
        ? normalizeQwenAgentConfig(deploymentConfig)
      : normalizeGenericAgent(clanker.agent);

  const runtimeSettings = asRuntimeSettings(deploymentConfig.settings);
  const runtime = runtimeSettings ? { settings: runtimeSettings } : undefined;

  return {
    version: 1,
    strategy,
    agent,
    ...(runtime ? { runtime } : {}),
  };
}
