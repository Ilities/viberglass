import type {
  AgentType,
  Clanker,
  ClankerAgentConfig,
  ClankerConfigV1,
  ClankerStrategyType,
  CodexAgentConfig,
} from "@viberglass/types";
import { isClankerConfigV1 } from "@viberglass/types";
import { normalizeCodexAgentConfig } from "./agents/codex";
import { normalizeDockerStrategyConfig } from "./strategies/docker";
import { normalizeEcsStrategyConfig } from "./strategies/ecs";
import { normalizeLambdaStrategyConfig } from "./strategies/lambda";
import { mapLegacyClankerConfig } from "./legacyMapper";

export interface ResolvedClankerConfig {
  config: ClankerConfigV1;
  source: "v1" | "legacy";
}

function normalizeStrategyName(name: string | undefined): ClankerStrategyType {
  const normalized = (name || "").toLowerCase();
  if (normalized === "ecs") {
    return "ecs";
  }
  if (normalized === "lambda" || normalized === "aws-lambda-container") {
    return "lambda";
  }
  return "docker";
}

function normalizeAgent(
  agent: ClankerConfigV1["agent"],
  fallbackAgent: AgentType | null | undefined,
): ClankerAgentConfig {
  if (agent.type === "codex") {
    return normalizeCodexAgentConfig(agent);
  }

  if (!agent.type && fallbackAgent === "codex") {
    return normalizeCodexAgentConfig(agent);
  }

  const candidate = agent.type || fallbackAgent;
  switch (candidate) {
    case "qwen-cli":
    case "qwen-api":
    case "opencode":
    case "kimi-code":
    case "gemini-cli":
    case "mistral-vibe":
    case "claude-code":
      return { type: candidate };
    default:
      return { type: "claude-code" };
  }
}

function normalizeV1Config(clanker: Clanker, config: ClankerConfigV1): ClankerConfigV1 {
  const strategyType = config.strategy?.type || normalizeStrategyName(clanker.deploymentStrategy?.name);

  const strategy =
    strategyType === "ecs"
      ? normalizeEcsStrategyConfig(config.strategy)
      : strategyType === "lambda"
        ? normalizeLambdaStrategyConfig(config.strategy)
        : normalizeDockerStrategyConfig(config.strategy);

  const agent = normalizeAgent(config.agent, clanker.agent);

  return {
    version: 1,
    strategy,
    agent,
    ...(config.runtime ? { runtime: config.runtime } : {}),
  };
}

export function resolveClankerConfig(clanker: Clanker): ResolvedClankerConfig {
  if (isClankerConfigV1(clanker.deploymentConfig)) {
    return {
      source: "v1",
      config: normalizeV1Config(clanker, clanker.deploymentConfig),
    };
  }

  return {
    source: "legacy",
    config: mapLegacyClankerConfig(clanker),
  };
}

export function getCodexAgentConfig(clanker: Clanker): CodexAgentConfig | null {
  const resolved = resolveClankerConfig(clanker);
  if (resolved.config.agent.type !== "codex") {
    return null;
  }

  return resolved.config.agent;
}

export function getStrategyType(clanker: Clanker): ClankerStrategyType {
  return resolveClankerConfig(clanker).config.strategy.type;
}
